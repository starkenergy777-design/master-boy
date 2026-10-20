import { formatLocalizedDate, localizeTree } from '../i18n.js';
import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CreditCard,
  Upload,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Clock,
  Building,
  LogOut,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Advertisement, Language, User } from '../types.js';
import { api } from '../api.js';

interface AdPartnerScreenProps {
  lang: Language;
  currentUser: User | null;
  onLogout: () => void;
  onBack: () => void;
}

export const AdPartnerScreen: React.FC<AdPartnerScreenProps> = ({
  lang,
  currentUser,
  onLogout,
}) => {
  const [ad, setAd] = useState<Advertisement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Editable Form fields
  const [companyName, setCompanyName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const loadAd = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await api.getPartnerAd();
      if (res?.ad) {
        setAd(res.ad);
        setCompanyName(res.ad.company_name || '');
        setTargetUrl(res.ad.target_url || '');
        setImageUrl(res.ad.image_url || '');
        setTermsAccepted(!!res.ad.terms_accepted);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'ვერ მოხერხდა სარეკლამო პროფილის ჩატვირთვა');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAd();
  }, []);

  const isPaidAndActive = Boolean(
    ad && ad.payment_status === 'paid' && new Date(ad.expires_at) > new Date()
  );

  const daysRemaining = ad?.expires_at
    ? Math.max(0, Math.ceil((new Date(ad.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Handle Terms Agreement
  const handleToggleTerms = async () => {
    const nextVal = !termsAccepted;
    setTermsAccepted(nextVal);
    if (nextVal) {
      try {
        await api.acceptPartnerTerms();
        setSuccessMsg('სარეკლამო პოლიტიკის წესებზე თანხმობა დაფიქსირებულია.');
      } catch (err: any) {
        setErrorMsg(err.message || 'თანხმობის დაფიქსირება ვერ მოხერხდა');
      }
    }
  };

  // Handle Image File Upload (convert to base64)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('ფაილის ზომა არ უნდა აღემატებოდეს 5MB-ს');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setImageUrl(event.target.result as string);
        setSuccessMsg('სურათი მზადაა ასატვირთად. დააჭირეთ „ბანერის განახლებას“.');
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Bank of Georgia iPay Payment
  const handlePay = async () => {
    if (!termsAccepted) {
      setErrorMsg('გადახდამდე აუცილებელია დაადასტუროთ თანხმობა სარეკლამო პოლიტიკის წესებზე.');
      return;
    }

    try {
      setPaying(true);
      setErrorMsg('');
      setSuccessMsg('');
      const res = await api.payPartnerAd();
      if (res?.ad) {
        setAd(res.ad);
      }
      setSuccessMsg(res.message || 'გადახდა წარმატებით შესრულდა (საქართველოს ბანკი). პაკეტი გააქტიურებულია!');
      loadAd();
    } catch (err: any) {
      setErrorMsg(err.message || 'გადახდის შესრულება ვერ მოხერხდა');
    } finally {
      setPaying(false);
    }
  };

  // Handle Content Save
  const handleSaveContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setErrorMsg('კომპანიის/ბრენდის ოფიციალური იურიდიული სახელწოდება სავალდებულოა!');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg('');
      setSuccessMsg('');
      const res = await api.updatePartnerAd({
        company_name: companyName.trim(),
        image_url: imageUrl,
        target_url: targetUrl.trim(),
      });
      if (res?.ad) {
        setAd(res.ad);
      }
      setSuccessMsg('სარეკლამო ბანერის მონაცემები წარმატებით განახლდა!');
    } catch (err: any) {
      setErrorMsg(err.message || 'მონაცემების შენახვა ვერ მოხერხდა');
    } finally {
      setSaving(false);
    }
  };

  return localizeTree(lang, (
    <div className="flex-1 flex flex-col p-4 pb-24 space-y-5 animate-fade-in text-slate-100 max-w-lg mx-auto w-full">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-black text-white flex items-center gap-1.5">
              <span>სარეკლამო პარტნიორის კაბინეტი</span>
            </h1>
            <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold border border-amber-500/30">
              AD_PARTNER
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            ნომერი: <span className="font-mono text-slate-300">{currentUser?.phone}</span>
          </p>
        </div>

        <button
          onClick={onLogout}
          className="text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700/80 px-2.5 py-1.5 rounded-xl text-slate-300 flex items-center gap-1.5 transition-colors"
          title="გამოსვლა"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>გასვლა</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3 text-xs text-rose-300 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3 text-xs text-emerald-300 flex items-center gap-2.5">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Package Status Banner */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-4 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`p-2.5 rounded-2xl border ${isPaidAndActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">
                {isPaidAndActive ? 'აქტიური სარეკლამო პაკეტი' : 'გადახდა მოლოდინის რეჟიმში'}
              </span>
              <span className="text-[11px] text-slate-400 block font-mono">
                {isPaidAndActive ? `ვადა: ${daysRemaining} დღე (აქტიურია ${formatLocalizedDate(lang, ad!.expires_at)}-მდე)` : 'რეკლამის გამოსაჩენად საჭიროა გააქტიურება'}
              </span>
            </div>
          </div>

          <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full border ${isPaidAndActive ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'}`}>
            {ad?.payment_status === 'paid' ? 'PAID' : 'PENDING'}
          </span>
        </div>
      </div>

      {/* 1. Strict Advertising Policy (სარეკლამო წესების ბლოკი) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3.5 shadow-sm">
        <div className="flex items-center gap-2 text-amber-400">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <h2 className="text-xs font-black uppercase tracking-wider text-white">
            სარეკლამო წესები და პოლიტიკა (მკაცრი მოთხოვნები)
          </h2>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 text-xs text-slate-300 space-y-2.5 leading-relaxed">
          <p className="font-semibold text-white">
            დაშვებულია მხოლოდ კომერციული რეკლამა. სავალდებულოა კომპანიის ოფიციალური იურიდიული სახელწოდების ზუსტად მითითება.
         