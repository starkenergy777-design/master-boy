import { formatLocalizedDate, localizeTree } from '../i18n.js';
import React, { useState, useEffect } from 'react';
import { UserCheck, Star, MessageSquare, Settings, Eye, EyeOff, Plus, Clock, LogOut, CheckCircle2, AlertTriangle, ShieldAlert, CreditCard, RefreshCw, X, AlertCircle, Trash2, Camera } from 'lucide-react';
import { translations } from '../i18n.js';
import { Language, User, Top15Membership, CraftsmanListingInfo, AdvertisementPublic } from '../types.js';
import { api } from '../api.js';

interface CraftsmanDashboardProps {
  lang: Language;
  currentUser: User;
  onOpenTop15Purchase: () => void;
  onOpenSupportChat: () => void;
  onLogout: () => void;
  onBack?: () => void;
}

export const CraftsmanDashboard: React.FC<CraftsmanDashboardProps> = ({
  lang,
  currentUser,
  onOpenTop15Purchase,
  onOpenSupportChat,
  onLogout,
  onBack,
}) => {
  const t = translations[lang] || translations.ka;
  const [craftsman, setCraftsman] = useState<any>(null);
  const [listing, setListing] = useState<CraftsmanListingInfo | null>(null);
  const [memberships, setMemberships] = useState<Top15Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'top15'>('profile');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [activeAd, setActiveAd] = useState<AdvertisementPublic | null>(null);

  // Renewal / Pay Modal
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState('prov-bog');
  const [paying, setPaying] = useState(false);
  const [renewalError, setRenewalError] = useState('');

  // Photo Management Modal & Delete Confirm (Replaces window.prompt/alert/confirm)
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoInputUrl, setPhotoInputUrl] = useState('');
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [showDeletePhotoConfirm, setShowDeletePhotoConfirm] = useState(false);

  const [paymentProviders, setPaymentProviders] = useState<{ id: string; name: string }[]>([
    { id: 'prov-bog', name: 'საქართველოს ბანკი (Bank of Georgia iPay)' },
  ]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const [resProfile, resMemberships, resListing, provList, resAd] = await Promise.all([
        api.getMyCraftsman(),
        api.getMyMemberships(),
        api.getCraftsmanListing().catch(() => null),
        api.getPaymentProviders().catch(() => []),
        api.getActiveAd().catch(() => ({ ad: null })),
      ]);
      setCraftsman(resProfile.craftsman);
      setActiveAd(resAd?.ad || null);
      setMemberships(resMemberships);
      if (provList && provList.length > 0) {
        setPaymentProviders(provList);
        setSelectedProviderId(provList[0].id);
      }
      if (resListing) {
        setListing(resListing);
        if (resListing.secondsRemaining !== undefined) {
          setRemainingSeconds(resListing.secondsRemaining);
        }
      }
    } catch (err) {
      console.error('Failed to load craftsman data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  // Server-authoritative live countdown timer (§4.2)
  useEffect(() => {
    if (remainingSeconds <= 0) return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [remainingSeconds]);

  const togglePhoneVisibility = async () => {
    if (!craftsman) return;
    try {
      setUpdating(true);
      const updated = await api.updateMyCraftsman({
        phoneVisible: !craftsman.phoneVisible,
      });
      setCraftsman(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  const handlePayOrRenew = async () => {
    setRenewalError('');
    try {
      setPaying(true);
      if (listing?.status === 'UNPAID_DRAFT') {
        const res = await api.payCraftsmanListing(selectedProviderId);
        if (res.listing) {
          setListing(res.listing);
          setRemainingSeconds(res.listing.secondsRemaining || 0);
        }
      } else {
        const res = await api.renewCraftsmanListing(selectedProviderId);
        if (res.listing) {
          setListing(res.listing);
          setRemainingSeconds(res.listing.secondsRemaining || 0);
        }
      }
      setShowRenewalModal(false);
      loadProfile();
    } catch (err: any) {
      setRenewalError(err.message || 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  const handleSavePhoto = async () => {
    if (!photoInputUrl.trim()) {
      setPhotoError(lang === 'ka' ? 'შეიყვანეთ ვალიდური ფოტოს URL' : 'Please enter a valid photo URL');
      return;
    }
    setPhotoError('');
    setPhotoSaving(true);
    try {
      // Remove existing photo if any (strictly 1 photo rule)
      if (craftsman?.photos && craftsman.photos.length > 0) {
        await api.deletePhoto(craftsman.photos[0].id);
      }
      const added = await api.addPhoto(photoInputUrl.trim(), true);
      setCraftsman({ ...craftsman, photos: [added] });
      setPhotoModalOpen(false);
    } catch (e: any) {
      setPhotoError(e.message || 'Failed to update photo');
    } finally {
      setPhotoSaving(false);
    }
  };

  const handleDeletePhoto = async () => {
    if (!craftsman?.photos?.[0]) return;
    setPhotoSaving(true);
    try {
      await api.deletePhoto(craftsman.photos[0].id);
      setCraftsman({ ...craftsman, photos: [] });
      setShowDeletePhotoConfirm(false);
    } catch (e: any) {
      setPhotoError(e.message || 'Failed to delete photo');
    } finally {
      setPhotoSaving(false);
    }
  };

  // Format seconds into Days, Hours, Minutes, Seconds
  const days = Math.floor(remainingSeconds / (24 * 3600));
  const hours = Math.floor((remainingSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  if (loading) {
    return localizeTree(lang, (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    ));
  }

  return localizeTree(lang, (
    <div className="flex-1 flex flex-col p-4 pb-20 space-y-4 animate-fade-in text-slate-100">
      {/* Craftsman Header with Listing Status Badge */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xl shrink-0">
            {craftsman?.name?.charAt(0) || 'C'}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-bold text-white">{craftsman?.name || 'ხელოსანი'}</h2>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                  listing?.status === 'ACTIVE'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : listing?.status === 'EXPIRED'
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                }`}
              >
                {listing?.status || 'ACTIVE'}
              </span>
            </div>
            <p className="text-xs text-amber-300 font-mono">{currentUser.phone}</p>
          </div>
        </div>

        <button
          onClick={onLogout}
          title={t.logout}
          className="p-2 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {activeAd && activeAd.company_name && activeAd.image_url && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="px-3 py-2 bg-slate-950/95 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                {lang === 'ka' ? 'რეკლამა' : lang === 'ru' ? 'Реклама' : 'Sponsored'}
              </span>
              <span className="text-xs font-bold text-white truncate">{activeAd.company_name}</span>
            </div>
          </div>
          <a
            href={activeAd.target_url || '#'}
            target={activeAd.target_url ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="block w-full aspect-[16/6] bg-slate-950 overflow-hidden"
          >
            <img src={activeAd.image_url} alt={activeAd.company_name} className="w-full h-full object-cover" loading="lazy" />
          </a>
        </div>
      )}

      {/* 180-Day Server-Authoritative Listing Timer & Warning Banners (§4.2, §24.5) */}
      {listing?.status === 'ACTIVE' ? (
        <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 rounded-3xl p-4 shadow space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-300">
                {lang === 'ka' ? '6-თვი