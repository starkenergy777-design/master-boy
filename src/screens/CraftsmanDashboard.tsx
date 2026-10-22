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
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [paying, setPaying] = useState(false);
  const [renewalError, setRenewalError] = useState('');

  // Photo Management Modal & Delete Confirm (Replaces window.prompt/alert/confirm)
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoInputUrl, setPhotoInputUrl] = useState('');
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [showDeletePhotoConfirm, setShowDeletePhotoConfirm] = useState(false);

  const [paymentProviders, setPaymentProviders] = useState<{ id: string; name: string }[]>([]);
  const [profileLoadError, setProfileLoadError] = useState('');
  const [profileActionError, setProfileActionError] = useState('');

  const listingPriceLabel = listing?.price && Number.isFinite(listing.price.amountMinor)
    ? `${(listing.price.amountMinor / 100).toFixed(2)} ${listing.price.currency || 'GEL'}`
    : (lang === 'ka' ? 'ფასი მიუწვდომელია' : lang === 'ru' ? 'Цена недоступна' : 'Price unavailable');

  const selectedPaymentProviderAvailable = paymentProviders.some((provider) => provider.id === selectedProviderId);
  const paymentUnavailableMessage = lang === 'ka'
    ? 'ონლაინ გადახდა ამჟამად არ არის ჩართული. ეს მოქმედება ახლა მიუწვდომელია.'
    : lang === 'ru'
      ? 'Онлайн-оплата сейчас не настроена. Это действие пока недоступно.'
      : 'Online payment is not configured yet. This action is unavailable.';

  const loadProfile = async () => {
    try {
      setProfileLoadError('');
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
      setPaymentProviders(Array.isArray(provList) ? provList : []);
      setSelectedProviderId('');
      if (resListing) {
        setListing(resListing);
        if (resListing.secondsRemaining !== undefined) {
          setRemainingSeconds(resListing.secondsRemaining);
        }
      }
    } catch (err: any) {
      console.error('Failed to load craftsman data:', err);
      setProfileLoadError(err.message || (lang === 'ka'
        ? 'პროფილის მონაცემები ვერ ჩაიტვირთა.'
        : lang === 'ru'
          ? 'Не удалось загрузить данные профиля.'
          : 'Could not load profile data.'));
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
    setProfileActionError('');
    try {
      setUpdating(true);
      const updated = await api.updateMyCraftsman({
        phoneVisible: !craftsman.phoneVisible,
      });
      setCraftsman(updated);
    } catch (err: any) {
      console.error(err);
      setProfileActionError(err.message || (lang === 'ka'
        ? 'ტელეფონის ხილვადობის შეცვლა ვერ მოხერხდა.'
        : lang === 'ru'
          ? 'Не удалось изменить видимость телефона.'
          : 'Could not update phone visibility.'));
    } finally {
      setUpdating(false);
    }
  };

  const handlePayOrRenew = async () => {
    setRenewalError('');
    if (!selectedPaymentProviderAvailable) {
      setRenewalError(paymentUnavailableMessage);
      return;
    }
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
      <div className="craftsman-dashboard flex-1 flex items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    ));
  }

  if (profileLoadError) {
    return localizeTree(lang, (
      <div className="craftsman-dashboard flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center text-slate-100">
        <p role="alert" className="max-w-sm text-sm text-rose-300">{profileLoadError}</p>
        <button
          type="button"
          onClick={loadProfile}
          className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
        >
          {lang === 'ka' ? 'სცადეთ ხელახლა' : lang === 'ru' ? 'Повторить' : 'Try again'}
        </button>
      </div>
    ));
  }

  return localizeTree(lang, (
    <div className="craftsman-dashboard flex-1 flex flex-col p-4 pb-20 space-y-4 animate-fade-in text-slate-100">
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
                {lang === 'ka' ? '6-თვიანი გამოწერის ტაიმერი:' : 'Listing Subscription Timer:'}
              </span>
            </div>
            <button
              onClick={() => setShowRenewalModal(true)}
              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/30 transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>{lang === 'ka' ? 'განახლება (+180 დღე)' : 'Renew (+180d)'}</span>
            </button>
          </div>

          {/* Countdown Display */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
              <span className="text-base font-black text-white font-mono">{days}</span>
              <span className="text-[9px] text-slate-400 block uppercase">{lang === 'ka' ? 'დღე' : 'Days'}</span>
            </div>
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
              <span className="text-base font-black text-white font-mono">{hours}</span>
              <span className="text-[9px] text-slate-400 block uppercase">{lang === 'ka' ? 'საათი' : 'Hours'}</span>
            </div>
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
              <span className="text-base font-black text-white font-mono">{minutes}</span>
              <span className="text-[9px] text-slate-400 block uppercase">{lang === 'ka' ? 'წუთი' : 'Mins'}</span>
            </div>
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
              <span className="text-base font-black text-amber-400 font-mono">{seconds}</span>
              <span className="text-[9px] text-slate-400 block uppercase">{lang === 'ka' ? 'წამი' : 'Secs'}</span>
            </div>
          </div>

          {/* Warning Banners per §4.2 */}
          {days < 7 ? (
            <div className="p-2.5 bg-rose-500/15 border border-rose-500/40 rounded-2xl flex items-center justify-between text-xs text-rose-300">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{lang === 'ka' ? `გამოწერა იწურება ${days} დღეში!` : `Listing expires in ${days} days!`}</span>
              </div>
              <button
                onClick={() => setShowRenewalModal(true)}
                className="bg-rose-500 hover:bg-rose-400 text-slate-950 text-[10px] font-bold px-2.5 py-1 rounded-lg"
              >
                {listingPriceLabel}
              </button>
            </div>
          ) : days < 30 ? (
            <div className="p-2.5 bg-amber-500/15 border border-amber-500/40 rounded-2xl flex items-center justify-between text-xs text-amber-300">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{lang === 'ka' ? 'განაახლეთ სიაში დარჩენისთვის (<30 დღე)' : 'Renew to stay listed (<30 days)'}</span>
              </div>
              <button
                onClick={() => setShowRenewalModal(true)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-bold px-2.5 py-1 rounded-lg"
              >
                {listingPriceLabel}
              </button>
            </div>
          ) : null}
        </div>
      ) : listing?.status === 'EXPIRED' ? (
        <div className="bg-rose-950/40 border border-rose-500/50 rounded-3xl p-4 shadow space-y-2.5">
          <div className="flex items-center gap-2 text-rose-400">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {lang === 'ka' ? 'გამოწერის ვადა ამოიწურა (30-დღიანი საშეღავათო პერიოდი)' : 'Listing Expired (30-day Grace Period)'}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {lang === 'ka'
              ? 'თქვენი პროფილი დროებით დამალულია ძიებიდან. განაახლეთ 30 დღის განმავლობაში, რათა მონაცემები არ წაიშალოს სამუდამოდ.'
              : 'Your profile is hidden from search. Renew within 30 days to avoid permanent data purge.'}
          </p>
          <button
            onClick={() => setShowRenewalModal(true)}
            className="w-full bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow"
          >
            {lang === 'ka'
              ? `გამოწერის განახლება (${listingPriceLabel})`
              : lang === 'ru'
                ? `Продлить размещение (${listingPriceLabel})`
                : `Renew Listing (${listingPriceLabel})`}
          </button>
        </div>
      ) : listing?.status === 'UNPAID_DRAFT' ? (
        <div className="bg-amber-950/40 border border-amber-500/50 rounded-3xl p-4 shadow space-y-2.5">
          <div className="flex items-center gap-2 text-amber-400">
            <CreditCard className="w-5 h-5 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {lang === 'ka' ? 'პროფილი არააქტიურია (გადაუხდელი)' : 'Profile Inactive (Unpaid)'}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {lang === 'ka'
              ? `ძიებაში გამოჩენისთვის გადაიხადეთ ${listingPriceLabel} და მიიღეთ 6-თვიანი (180 დღე) ხილვადობა.`
              : lang === 'ru'
                ? `Оплатите ${listingPriceLabel}, чтобы профиль был виден в поиске 6 месяцев (180 дней).`
                : `Pay ${listingPriceLabel} for 6 months (180 days) of visibility in search results.`}
          </p>
          <button
            onClick={() => setShowRenewalModal(true)}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs shadow"
          >
            {lang === 'ka'
              ? `გადახდა (${listingPriceLabel}) და გააქტიურება`
              : lang === 'ru'
                ? `Оплатить (${listingPriceLabel}) и активировать`
                : `Pay (${listingPriceLabel}) & Activate`}
          </button>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex rounded-2xl bg-slate-900/80 p-1 border border-slate-800 text-xs font-semibold">
        <button
          type="button"
          data-cabinet-tab="true"
          aria-pressed={activeTab === 'profile'}
          onClick={() => setActiveTab('profile')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeTab === 'profile'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          {t.myProfile}
        </button>
        <button
          type="button"
          data-cabinet-tab="true"
          aria-pressed={activeTab === 'top15'}
          onClick={() => setActiveTab('top15')}
          className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1 ${
            activeTab === 'top15'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span>{t.myTop15}</span>
          {memberships.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-slate-950 text-amber-400 rounded-full font-bold">
              {memberships.length}
            </span>
          )}
        </button>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="space-y-4">
          {/* Phone Visibility Switch (§3.4) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-white block flex items-center gap-1.5">
                {craftsman?.phoneVisible ? (
                  <Eye className="w-4 h-4 text-emerald-400" />
                ) : (
                  <EyeOff className="w-4 h-4 text-slate-500" />
                )}
                <span>{t.phoneVisibility}</span>
              </span>
              <span className="text-[11px] text-slate-400 block max-w-[220px]">
                {t.phoneVisibilityDesc}
              </span>
            </div>
            <button
              type="button"
              aria-label={craftsman?.phoneVisible
                ? (lang === 'ka' ? 'ტელეფონის დამალვა' : lang === 'ru' ? 'Скрыть телефон' : 'Hide phone')
                : (lang === 'ka' ? 'ტელეფონის გამოჩენა' : lang === 'ru' ? 'Показать телефон' : 'Show phone')}
              aria-pressed={Boolean(craftsman?.phoneVisible)}
              onClick={togglePhoneVisibility}
              disabled={updating}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                craftsman?.phoneVisible ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                aria-hidden="true"
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  craftsman?.phoneVisible ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          {profileActionError && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {profileActionError}
            </p>
          )}

          {/* Quick Action: AI Support Chat */}
          <button
            type="button"
            onClick={onOpenSupportChat}
            className="w-full text-left bg-gradient-to-r from-slate-900 to-indigo-950/40 border border-indigo-500/40 rounded-2xl p-4 flex items-center justify-between hover:border-indigo-400 transition-all shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
          >
            <span className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <MessageSquare className="w-5 h-5" />
              </span>
              <span>
                <span className="text-xs font-bold text-white block">{t.supportChat}</span>
                <span className="text-[11px] text-indigo-300 block">{t.supportSubtitle}</span>
                <span className="text-[10px] text-slate-400 block">{lang === 'ka' ? 'დღეში 7 შეტყობინების ლიმიტი' : lang === 'ru' ? 'Лимит: 7 сообщений в день' : '7 messages per day'}</span>
              </span>
            </span>
            <span className="text-xs text-indigo-400 font-bold bg-indigo-950/60 px-2.5 py-1 rounded-lg border border-indigo-800">
              {lang === 'ka' ? 'ჩატის გახსნა' : lang === 'ru' ? 'Открыть чат' : 'Open chat'}
            </span>
          </button>

          {/* Photo Management (Max 1 Photo Rule) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">
                  პროფილის ფოტო
                </span>
                <span className="text-[10px] text-amber-400 font-semibold block">
                  {lang === 'ka' ? 'მთავარი ფოტო' : 'Primary Photo'}
                </span>
              </div>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                {craftsman?.photos?.length || 0} / 1
              </span>
            </div>

            {craftsman?.photos && craftsman.photos.length > 0 ? (
              <div className="flex items-center gap-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-800 border border-amber-500/40 shrink-0">
                  <img
                    src={craftsman.photos[0].url}
                    alt={craftsman.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-white truncate block">
                    მთავარი ფოტო (აქტიური)
                  </span>
                  <span className="text-[10px] text-slate-500 block truncate font-mono">
                    {craftsman.photos[0].url}
                  </span>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => {
                        setPhotoInputUrl(craftsman.photos[0].url);
                        setPhotoError('');
                        setPhotoModalOpen(true);
                      }}
                      className="text-[10px] text-amber-400 hover:underline font-semibold"
                    >
                      {lang === 'ka' ? 'ფოტოს შეცვლა' : 'Change Photo'}
                    </button>
                    <button
                      onClick={() => setShowDeletePhotoConfirm(true)}
                      className="text-[10px] text-rose-400 hover:underline font-semibold ml-2"
                    >
                      {lang === 'ka' ? 'წაშლა' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950/60 p-3 rounded-xl border border-dashed border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {lang === 'ka' ? 'ფოტო არ არის ატვირთული' : 'No photo uploaded'}
                </span>
                <button
                  onClick={() => {
                    setPhotoInputUrl('');
                    setPhotoError('');
                    setPhotoModalOpen(true);
                  }}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                >
                  {lang === 'ka' ? 'ფოტოს დამატება' : 'Add Photo'}
                </button>
              </div>
            )}
          </div>

          {/* Profile Overview */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
            <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
              {t.aboutCraftsman}
            </h3>
            <p className="text-slate-300 leading-relaxed whitespace-pre-line bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              {craftsman?.description || 'აღწერა არ არის მითითებული.'}
            </p>

          </div>
        </div>
      )}

      {/* Top 15 Tab */}
      {activeTab === 'top15' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-900 border border-amber-500/40 rounded-3xl p-5 shadow-lg space-y-3">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
              <h3 className="text-sm font-black text-white">{t.top15Badge}</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {t.top15Desc}
            </p>
            <button
              onClick={onOpenTop15Purchase}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl shadow-lg flex items-center justify-center gap-2 text-xs transition-all active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>{t.buyTop15}</span>
            </button>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider px-1">
              {lang === 'ka' ? 'ჩემი აქტიური TOP 15 ადგილები' : 'My Active Top 15 Slots'}
            </h3>

            {memberships.length === 0 ? (
              <div className="p-6 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800 text-xs">
                {lang === 'ka' ? 'აქტიური TOP 15 ადგილი არ გაქვთ' : 'No active Top 15 slots'}
              </div>
            ) : (
              memberships.map((m) => (
                <div
                  key={m.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      <h4 className="text-xs font-bold text-white">
                        {m.cityName} • {m.professionName}
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      ვადა: {formatLocalizedDate(lang, m.expiresAt)}
                    </p>
                  </div>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold border border-emerald-500/30">
                    {m.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Payment / Renewal Modal (§3.11, §6.3, §24) */}
      {showRenewalModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {listing?.status === 'UNPAID_DRAFT'
                  ? (lang === 'ka' ? 'გამოწერის გადახდა' : 'Pay Subscription')
                  : (lang === 'ka' ? 'გამოწერის განახლება (+180 დღე)' : 'Renew Subscription (+180d)')}
              </h3>
              <button
                onClick={() => setShowRenewalModal(false)}
                className="text-slate-400 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{lang === 'ka' ? 'პროდუქტი:' : 'Product:'}</span>
                <span className="font-semibold text-white">6-თვიანი ხილვადობა</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{lang === 'ka' ? 'ღირებულება:' : 'Amount:'}</span>
                <span className="font-bold text-amber-400 font-mono text-sm">{listingPriceLabel}</span>
              </div>
            </div>

            {renewalError && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                {renewalError}
              </div>
            )}

            {paymentProviders.length > 0 ? (
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-slate-400">
                  {lang === 'ka' ? 'აირჩიეთ გადახდის პროვაიდერი' : lang === 'ru' ? 'Выберите платёжного провайдера' : 'Select a payment provider'}
                </label>
                <div className="space-y-1.5">
                  {paymentProviders.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      aria-pressed={selectedProviderId === p.id}
                      onClick={() => setSelectedProviderId(p.id)}
                      className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                        selectedProviderId === p.id
                          ? 'bg-amber-500/10 border-amber-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span>{p.name}</span>
                      {selectedProviderId === p.id && <span aria-hidden="true" className="w-2 h-2 rounded-full bg-amber-400" />}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div role="status" className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
                {paymentUnavailableMessage}
              </div>
            )}

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowRenewalModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                {lang === 'ka' ? 'გაუქმება' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handlePayOrRenew}
                disabled={paying || !selectedPaymentProviderAvailable}
                className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 rounded-xl text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {paying
                  ? '...'
                  : !paymentProviders.length
                    ? (lang === 'ka' ? 'გადახდა მიუწვდომელია' : lang === 'ru' ? 'Оплата недоступна' : 'Payment unavailable')
                    : !selectedPaymentProviderAvailable
                      ? (lang === 'ka' ? 'აირჩიეთ პროვაიდერი' : lang === 'ru' ? 'Выберите провайдера' : 'Select provider')
                      : (lang === 'ka'
                        ? `გადახდა (${listingPriceLabel})`
                        : lang === 'ru'
                          ? `Оплатить (${listingPriceLabel})`
                          : `Pay (${listingPriceLabel})`)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Add / Change In-App Modal (Replaces window.prompt/alert) */}
      {photoModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-xs w-full space-y-4 shadow-2xl animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  {craftsman?.photos?.length > 0
                    ? (lang === 'ka' ? 'ფოტოს შეცვლა' : 'Change Photo')
                    : (lang === 'ka' ? 'ფოტოს დამატება' : 'Add Photo')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPhotoModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              {lang === 'ka'
                ? 'შეიყვანეთ ფოტოს ბმული (მაგ. https://...):'
                : 'Enter direct image URL (e.g. https://...):'}
            </p>

            {photoError && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{photoError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <input
                type="url"
                value={photoInputUrl}
                onChange={(e) => setPhotoInputUrl(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            {photoInputUrl && (
              <div className="w-20 h-20 rounded-xl overflow-hidden border border-slate-700 mx-auto">
                <img
                  src={photoInputUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  onError={() => setPhotoError(lang === 'ka' ? 'ფოტოს ჩატვირთვა ვერ მოხერხდა' : 'Failed to load preview')}
                />
              </div>
            )}

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setPhotoModalOpen(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                {lang === 'ka' ? 'გაუქმება' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSavePhoto}
                disabled={photoSaving}
                className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {photoSaving ? '...' : (lang === 'ka' ? 'შენახვა' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Photo Confirmation Modal */}
      {showDeletePhotoConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-xs w-full space-y-4 shadow-2xl animate-scale-up text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-sm font-bold text-white mb-1">
                {lang === 'ka' ? 'ფოტოს წაშლა' : 'Delete Photo'}
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'ka'
                  ? 'ნამდვილად გსურთ პროფილის ფოტოს წაშლა?'
                  : 'Are you sure you want to delete your profile photo?'}
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeletePhotoConfirm(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                {lang === 'ka' ? 'გაუქმება' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleDeletePhoto}
                disabled={photoSaving}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {photoSaving ? '...' : (lang === 'ka' ? 'წაშლა' : 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  ));
};

