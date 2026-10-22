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
  const [paymentAvailable, setPaymentAvailable] = useState(false);
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
      const [res, providers] = await Promise.all([
        api.getPartnerAd(),
        api.getPaymentProviders().catch(() => []),
      ]);
      setPaymentAvailable(providers.length > 0);
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
  const adPriceLabel = Number(ad?.price_gel ?? 50).toFixed(2);

  // Handle Terms Agreement
  const handleToggleTerms = async () => {
    const nextVal = !termsAccepted;
    setTermsAccepted(nextVal);
    if (nextVal) {
      try {
        await api.acceptPartnerTerms();
        setSuccessMsg('სარეკლამო პოლიტიკის წესებზე თანხმობა დაფიქსირებულია.');
      } catch (err: any) {
        setTermsAccepted(false);
        setErrorMsg(err.message || (lang === 'ka'
          ? 'თანხმობის დაფიქსირება ვერ მოხერხდა'
          : lang === 'ru'
            ? 'Не удалось сохранить согласие.'
            : 'Could not save your agreement.'));
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
      if (res?.success !== true) {
        setErrorMsg(lang === 'ka'
          ? 'გადახდა სერვერს არ დაუდასტურებია.'
          : lang === 'ru'
            ? 'Сервер не подтвердил оплату.'
            : 'The server did not confirm the payment.');
        return;
      }
      setSuccessMsg(res.message || (lang === 'ka'
        ? 'გადახდა დადასტურდა და პაკეტი გააქტიურდა.'
        : lang === 'ru'
          ? 'Оплата подтверждена, пакет активирован.'
          : 'Payment confirmed and package activated.'));
      await loadAd();
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
    <div className="adpartner-dashboard flex-1 flex flex-col p-4 pb-24 space-y-5 animate-fade-in text-slate-100 max-w-lg mx-auto w-full">
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
          </p>

          <p className="font-bold text-rose-400 text-[11px] uppercase tracking-wide">
            მკაცრად აკრძალულია:
          </p>

          <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px] pl-1">
            <li>პოლიტიკური რეკლამა ან ანტირეკლამა;</li>
            <li>შეურაცხმყოფელი, დისკრიმინაციული ან სიძულვილის ენის შემცველი კონტენტი;</li>
            <li>სექსუალური, ეროტიკული ან პორნოგრაფიული ხასიათის გამოსახულება/ტექსტი;</li>
            <li>თამბაქოს, ელექტრონული სიგარეტისა და ნიკოტინის შემცველი ნაწარმის რეკლამა;</li>
            <li>განსხვავებული სექსუალური ორიენტაციის რეკლამა, ლგბტ ან ნებისმიერი სხვა სახის იდეოლოგიური/სოციალური პროპაგანდა;</li>
            <li>სოციალური, რელიგიური შინაარსი/სიმბოლოები და დღესასწაულების გამოხატვა.</li>
          </ol>

          <div className="pt-2 border-t border-slate-800 text-[10px] text-amber-300/90 bg-amber-500/5 p-2 rounded-xl border border-amber-500/20">
            ⚠️ წესების დარღვევის ან არასწორი მონაცემების მითითების შემთხვევაში კომპანია იტოვებს უფლებას ცალმხრივად, მყისიერად გააუქმოს ხელშეკრულება, წაშალოს რეკლამა და დაბლოკოს ანგარიში თანხის დაბრუნების გარეშე.
          </div>
        </div>

        {/* Terms Acceptance Checkbox */}
        <label className="flex items-start gap-3 p-3 bg-slate-950 border border-slate-800 rounded-2xl cursor-pointer hover:border-slate-700 transition-colors">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={handleToggleTerms}
            className="w-4 h-4 mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-400 bg-slate-900"
          />
          <span className="text-xs font-semibold text-slate-200">
            ვადასტურებ, რომ გავეცანი და ვეთანხმები სარეკლამო პოლიტიკის წესებს
          </span>
        </label>
      </div>

      {/* 2. Bank of Georgia iPay Payment Block */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3.5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-xs font-bold text-white">სარეკლამო პაკეტის შეძენა</h3>
              <p className="text-[10px] text-slate-400">
                {lang === 'ka'
                  ? `საგადახდო სისტემა • ${(ad as any)?.days_duration || 30} დღე`
                  : lang === 'ru'
                    ? `Платёжная система • ${(ad as any)?.days_duration || 30} дн.`
                    : `Payment provider • ${(ad as any)?.days_duration || 30} days`}
              </p>
            </div>
          </div>
          {!paymentAvailable && (
            <p className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-200">
              {lang === 'ka' ? 'ონლაინ გადახდა დროებით მიუწვდომელია.' : lang === 'ru' ? 'Онлайн-оплата пока недоступна.' : 'Online payment is not available yet.'}
            </p>
          )}
          <span className="text-sm font-black font-mono text-white bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
            {adPriceLabel} GEL
          </span>
        </div>

        <button
          onClick={handlePay}
          disabled={!termsAccepted || paying || !paymentAvailable}
          className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-bold py-3 rounded-2xl text-xs shadow-md transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {paying ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <CreditCard className="w-4 h-4 stroke-[2.5]" />
          )}
          <span>
            {!paymentAvailable
              ? (lang === 'ka' ? 'გადახდა მიუწვდომელია' : lang === 'ru' ? 'Оплата недоступна' : 'Payment unavailable')
              : !termsAccepted
              ? 'ჯერ დაეთანხმეთ სარეკლამო წესებს'
              : isPaidAndActive
                ? (lang === 'ka'
                  ? `პაკეტის განახლება / +${String((ad as any)?.days_duration || 30)} დღის დამატება (${adPriceLabel} GEL)`
                  : lang === 'ru'
                    ? `Продлить пакет / +${String((ad as any)?.days_duration || 30)} дней (${adPriceLabel} GEL)`
                    : `Renew package / +${String((ad as any)?.days_duration || 30)} days (${adPriceLabel} GEL)`)
                : (lang === 'ka'
                  ? `გადახდა ბარათით (${adPriceLabel} GEL / ${String((ad as any)?.days_duration || 30)} დღე)`
                  : lang === 'ru'
                    ? `Оплатить картой (${adPriceLabel} GEL / ${String((ad as any)?.days_duration || 30)} дн.)`
                    : `Pay by card (${adPriceLabel} GEL / ${String((ad as any)?.days_duration || 30)} days)`)}

          </span>
        </button>
      </div>

      {/* 3. Content Management (Only available when paid & active) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3.5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Building className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-xs font-bold text-white">სარეკლამო ბანერის კონტენტის მართვა</h3>
              <p className="text-[10px] text-slate-400">იურიდიული სახელი, ფოტო და ბმული</p>
            </div>
          </div>
          {!isPaidAndActive && (
            <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-bold border border-rose-500/30">
              დაბლოკილია
            </span>
          )}
        </div>

        {!isPaidAndActive ? (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-center space-y-2">
            <AlertCircle className="w-6 h-6 text-amber-400 mx-auto" />
            <p className="text-xs text-slate-300 font-semibold">
              კონტენტის რედაქტირება ხელმისაწვდომია მხოლოდ გადახდილი და აქტიური პაკეტის დროს.
            </p>
            <p className="text-[11px] text-slate-500">
              გაიარეთ გადახდა ზედა სექციაში, რომ განათავსოთ თქვენი ბანერი მთავარ გვერდზე.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSaveContent} className="space-y-3.5 text-xs">
            {/* Company Name (Mandatory) */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 px-1 flex items-center justify-between">
                <span>კომპანიის / ბრენდის ოფიციალური იურიდიული სახელწოდება</span>
                <span className="text-amber-400 text-[10px] font-bold">სავალდებულო</span>
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="მაგ: შპს „ელიტ ელექტრონიქსი“ (Elit Electronics)"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 transition-colors"
              />
              <p className="text-[10px] text-slate-400 px-1">
                ეს სახელი გამოჩნდება ბანერის სათაურში საიტის ყველა მომხმარებლისთვის.
              </p>
            </div>

            {/* Target URL */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-300 px-1">
                {lang === 'ka' ? 'სამიზნე ბმული (URL)' : lang === 'ru' ? 'Целевая ссылка (URL)' : 'Destination URL'}
              </label>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://yourbrand.ge"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>

            {/* Image File Upload & URL */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-slate-300 px-1 flex items-center justify-between">
                <span>სარეკლამო სურათი (16:7 ან 16:9 ფორმატი)</span>
                <span className="text-slate-400 text-[10px]">
                  {lang === 'ka' ? 'JPG / PNG (მაქს. 5 მბ)' : lang === 'ru' ? 'JPG / PNG (макс. 5 МБ)' : 'JPG / PNG (max. 5 MB)'}
                </span>
              </label>

              <div className="flex gap-2">
                <label className="flex-1 bg-slate-950 hover:bg-slate-800 border border-dashed border-slate-700 hover:border-amber-400 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors text-slate-300 text-xs">
                  <Upload className="w-4 h-4 text-amber-400" />
                  <span>ფაილის ატვირთვა მოწყობილობიდან</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 px-1">ან ჩაწერეთ პირდაპირი სურათის ბმული:</span>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/banner.jpg"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>
            </div>

            {/* Live Banner Preview */}
            {imageUrl && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                  {lang === 'ka' ? 'მთავარი გვერდის წინასწარი ხედი:' : lang === 'ru' ? 'Предварительный просмотр на главной странице:' : 'Homepage preview:'}
                </span>
                <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                  <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                        რეკლამა
                      </span>
                      <span className="text-xs font-bold text-white truncate">
                        {companyName || 'კომპანიის სახელწოდება'}
                      </span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div className="aspect-[16/7] w-full overflow-hidden bg-slate-950">
                    <img src={imageUrl} alt="Ad Preview" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs shadow transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>ბანერის განახლება</span>
            </button>
          </form>
        )}
      </div>
    </div>
  ));
};

