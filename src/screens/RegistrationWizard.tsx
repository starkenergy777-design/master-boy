import { localizeTree } from '../i18n.js';
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Sparkles, AlertCircle, Camera, Clock, Eye, EyeOff, CreditCard, ShieldCheck, Phone, Lock } from 'lucide-react';
import { translations } from '../i18n.js';
import { Language, City, Profession, PaymentProvider } from '../types.js';
import { api } from '../api.js';

interface RegistrationWizardProps {
  lang: Language;
  onCancel: () => void;
  onComplete: () => void;
  step?: number;
  onStepChange?: (step: number) => void;
}

export const RegistrationWizard: React.FC<RegistrationWizardProps> = ({
  lang,
  onCancel,
  onComplete,
  step: controlledStep,
  onStepChange,
}) => {
  const t = translations[lang] || translations.ka;
  const [internalStep, setInternalStep] = useState(1);
  const step = controlledStep !== undefined ? controlledStep : internalStep;
  const setStep = (next: number | ((s: number) => number)) => {
    const nextVal = typeof next === 'function' ? next(step) : next;
    if (onStepChange) {
      onStepChange(nextVal);
    } else {
      setInternalStep(nextVal);
    }
  };
  const [cities, setCities] = useState<City[]>([]);
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('prov-bog');
  const [showPassword, setShowPassword] = useState(false);

  const [paymentProviders, setPaymentProviders] = useState<{ id: string; name: string; code?: string }[]>([
    { id: 'prov-bog', name: 'საქართველოს ბანკი (Bank of Georgia iPay)', code: 'bog' },
  ]);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '+9955',
    password: '',
    description: '',
    bankAccount: '',
    cityId: '',
    professionId: '',
    phoneVisible: true,
    photoUrl: 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=800&auto=format&fit=crop&q=80',
    workingHours: {
      monday: '09:00-18:00',
      tuesday: '09:00-18:00',
      wednesday: '09:00-18:00',
      thursday: '09:00-18:00',
      friday: '09:00-18:00',
      saturday: '10:00-15:00',
      sunday: null,
    },
  });

  useEffect(() => {
    async function init() {
      try {
        const [cList, pList, provList] = await Promise.all([
          api.getCities().catch(() => []),
          api.getProfessions().catch(() => []),
          api.getPaymentProviders().catch(() => []),
        ]);
        setCities(cList);
        setProfessions(pList);
        if (provList && provList.length > 0) {
          setPaymentProviders(provList);
          setSelectedProviderId(provList[0].id);
        }
        if (cList.length > 0 && !formData.cityId) {
          setFormData((prev) => ({ ...prev, cityId: cList[0].id }));
        }
        if (pList.length > 0 && !formData.professionId) {
          setFormData((prev) => ({ ...prev, professionId: pList[0].id }));
        }

        if (api.getToken()) {
          try {
            const me = await api.getMe();
            if (me?.phone) {
              setFormData((prev) => ({ ...prev, phone: me.phone }));
            }
          } catch {}
        }

        // Restore draft if server has saved state
        try {
          const myDraftRes = await api.getMyCraftsman();
          if (myDraftRes && myDraftRes.draft) {
            setStep(myDraftRes.draft.step || 1);
            setFormData((prev) => ({ ...prev, ...(myDraftRes.draft.data || {}) }));
          }
        } catch {
          // Clean initial wizard step for new craftsmen
        }
      } catch (err) {
        console.error('Failed to init wizard:', err);
      }
    }
    init();
  }, []);

  // Server-side draft auto-save (§4.2 & §6.3)
  const autoSaveDraft = async (newStep: number, updatedData: any) => {
    if (!api.getToken()) return;
    try {
      await api.saveDraft(newStep, updatedData);
    } catch (err) {
      console.warn('Draft auto-save warning:', err);
    }
  };

  const handleNext = () => {
    setErrorMsg('');
    if (step === 1) {
      if (!formData.name.trim()) {
        setErrorMsg(lang === 'ka' ? 'შეიყვანეთ თქვენი სახელი და გვარი' : 'Enter your name');
        return;
      }
      if (!formData.phone || formData.phone.trim().length < 8) {
        setErrorMsg(lang === 'ka' ? 'შეიყვანეთ ვალიდური ტელეფონის ნომერი (მინ. 8 ციფრი)' : 'Enter valid phone number');
        return;
      }
      if (!api.getToken() && (!formData.password || formData.password.length < 12)) {
        setErrorMsg(lang === 'ka' ? 'პაროლი უნდა შედგებოდეს მინიმუმ 12 სიმბოლოსგან' : 'Password must be at least 12 characters');
        return;
      }
      if (!formData.cityId || !formData.professionId) {
        setErrorMsg(lang === 'ka' ? 'აირჩიეთ ქალაქი და პროფესია' : 'Select city and profession');
        return;
      }
    }

    const nextStep = step + 1;
    setStep(nextStep);
    autoSaveDraft(nextStep, formData);
  };

  const handleSubmit = async () => {
    setErrorMsg('');
    try {
      setLoading(true);
      const payload = {
        ...formData,
        paid: true,
        providerId: selectedProviderId,
        photos: [
          {
            id: `ph-${Date.now()}`,
            url: formData.photoUrl,
            displayOrder: 0,
            isPrimary: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      if (api.getToken()) {
        await api.registerCraftsman(payload);
      } else {
        const res = await api.directRegisterCraftsman(payload);
        if (res.sessionToken) {
          api.setToken(res.sessionToken);
        }
      }
      onComplete();
    } catch (err: any) {
      setErrorMsg(err.code === 'PAYMENT_PROVIDER_NOT_READY' || err.code === 'PAYMENT_PROVIDER_UNAVAILABLE'
        ? (lang === 'ka'
          ? 'საგადახდო პროვაიდერი ჯერ დაკავშირებული არ არის. ანგარიში არ შექმნილა; სცადეთ მოგვიანებით.'
          : lang === 'ru'
            ? 'Платёжный провайдер ещё не подключён. Аккаунт не создан; попробуйте позже.'
            : 'The payment provider is not configured yet. No account was created; please try again later.')
        : (err.message || 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return localizeTree(lang, (
    <div className="flex-1 flex flex-col p-4 pb-20 justify-between animate-fade-in text-slate-100">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
              {lang === 'ka' ? `ნაბიჯი ${step} / 3` : `Step ${step} / 3`}
            </span>
            <span className="text-xs font-semibold text-slate-300">
              {step === 1 && (lang === 'ka' ? 'პირადი მონაცემები' : 'Personal Info')}
              {step === 2 && (lang === 'ka' ? 'სამუშაო გრაფიკი' : 'Working Hours')}
              {step === 3 && (lang === 'ka' ? 'გამოწერა (10 GEL)' : 'Subscription (10 GEL)')}
            </span>
          </div>
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="text-xs text-slate-400 hover:text-amber-400 flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500/40"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>{lang === 'ka' ? 'წინა ნაბიჯი' : 'Prev Step'}</span>
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-6">
          <div
            className="bg-amber-500 h-full transition-all duration-300 rounded-full"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        <h2 className="text-xl font-black text-white mb-1">
          {step === 1 && (lang === 'ka' ? 'პირადი მონაცემები და პროფესია' : 'Personal Info & Profession')}
          {step === 2 && (lang === 'ka' ? 'სამუშაო საათები და პარამეტრები' : 'Working Hours & Settings')}
          {step === 3 && (lang === 'ka' ? 'გამოწერის გადახდა (10 GEL / 6 თვე)' : 'Subscription Payment (10 GEL / 6 months)')}
        </h2>
        <p className="text-xs text-slate-400 mb-6">
          {lang === 'ka'
            ? 'შეავსეთ ველები ხელოსნის პროფილის გასააქტიურებლად'
            : 'Fill in the details to activate your craftsman profile.'}
        </p>

        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-center gap-2 text-xs text-rose-300 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Step 1: Personal Info & Profession & Photo */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-slate-400 px-1">
                {t.fullName} *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="გიორგი ბერიძე"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-400 px-1">
                  {t.phoneInput} *
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+995599000000"
                    disabled={!!api.getToken()}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500 disabled:opacity-60"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-400 px-1">
                  {t.setPassword} *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    minLength={12}
                    placeholder="••••••••"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 pr-8 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                    required={!api.getToken()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-400 px-1">
                  {t.city} *
                </label>
                <select
                  value={formData.cityId}
                  onChange={(e) => setFormData({ ...formData, cityId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-400 px-1">
                  {t.profession} *
                </label>
                <select
                  value={formData.professionId}
                  onChange={(e) => setFormData({ ...formData, professionId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  {professions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-slate-400 px-1">
                {t.description}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="აღწერეთ თქვენი გამოცდილება, სერვისები და პირობები..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-slate-400 px-1 flex items-center justify-between">
                <span>საბანკო ანგარიში / IBAN (საქართველოს ბანკი)</span>
                <span className="text-amber-400 text-[10px]">სურვილისამებრ</span>
              </label>
              <input
                type="text"
                placeholder="GE00BG0000000000000000"
                value={formData.bankAccount}
                onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value.toUpperCase().replace(/\s/g, '') })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500 uppercase"
              />
              <p className="text-[10px] text-slate-500 px-1">
                ჩაწერეთ თქვენი ანგარიშის ნომერი, რათა კლიენტებმა შეძლონ პირდაპირი გადარიცხვა.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-slate-400 px-1 flex items-center justify-between">
                <span>პროფილის ფოტოს URL</span>
                <span className="text-amber-400 font-bold text-[10px]">მაქსიმუმ 1 ფოტო</span>
              </label>
              <input
                type="url"
                value={formData.photoUrl}
                onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
              <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-700 mt-2">
                <img src={formData.photoUrl} alt="Preview" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Working Hours & Phone Visibility */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">
                  {t.phoneVisibility}
                </span>
                <span className="text-[11px] text-slate-400 block max-w-[220px]">
                  {t.phoneVisibilityDesc}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, phoneVisible: !formData.phoneVisible })}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                  formData.phoneVisible ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    formData.phoneVisible ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-medium text-slate-400 px-1">
                {t.workingHours}
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                  <span className="text-slate-400 block text-[10px]">ორშაბათი - პარასკევი</span>
                  <span className="font-semibold text-white">09:00 - 18:00</span>
                </div>
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                  <span className="text-slate-400 block text-[10px]">შაბათი</span>
                  <span className="font-semibold text-white">10:00 - 15:00</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Subscription Payment (§3.11, §4.2, §24) */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-950/30 p-3 text-xs text-sky-200">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>{lang === 'ka'
                ? 'რეგისტრაციისას SMS კოდი არ მოითხოვება. ანგარიში შეიქმნება მხოლოდ გამოწერის გადახდის დადასტურების შემდეგ.'
                : lang === 'ru'
                  ? 'Для регистрации SMS-код не требуется. Аккаунт будет создан только после подтверждения оплаты подписки.'
                  : 'No SMS code is required to register. Your account is created only after the subscription payment is confirmed.'}</span>
            </div>
            <div className="bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-900 border border-amber-500/40 rounded-3xl p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  {lang === 'ka' ? 'ხელოსნის 6-თვიანი გამოწერა' : '6-Month Craftsman Listing'}
                </span>
                <span className="text-lg font-black text-white font-mono">
                  10.00 GEL
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {lang === 'ka'
                  ? 'გამოწერა მოიცავს 180 დღიან ხილვადობას "სხვა ხელოსნების" სიაში თქვენი ქალაქისა და პროფესიის მიხედვით.'
                  : 'Subscription covers 180 days of visibility in the "Other craftsmen" list for your city and profession.'}
              </p>
              <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-500/30">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  {lang === 'ka'
                    ? 'გარანტირებული 180 დღე (სერვერული ტაიმერი). განახლება შესაძლებელია ნებისმიერ დროს.'
                    : 'Guaranteed 180 days server timer. Can be renewed anytime.'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-medium text-slate-400 px-1">
                {lang === 'ka' ? 'აირჩიეთ გადახდის მეთოდი' : 'Select Payment Provider'}
              </label>
              <div className="space-y-2">
                {paymentProviders.map((prov) => (
                  <div
                    key={prov.id}
                    onClick={() => setSelectedProviderId(prov.id)}
                    className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                      selectedProviderId === prov.id
                        ? 'bg-amber-500/10 border-amber-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <CreditCard className={`w-4 h-4 ${selectedProviderId === prov.id ? 'text-amber-400' : 'text-slate-400'}`} />
                      <span className="text-xs font-semibold">{prov.name}</span>
                    </div>
                    {selectedProviderId === prov.id && (
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="pt-6 space-y-2">
        {step < 3 ? (
          <button
            type="button"
            onClick={handleNext}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-bold py-3.5 px-4 rounded-xl shadow-lg flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.98]"
          >
            <span>{t.next}</span>
          </button>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 text-slate-950 font-bold py-3.5 px-4 rounded-xl shadow-lg flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{lang === 'ka' ? 'გადახდა (10 GEL) და აქტივაცია' : 'Pay 10 GEL & Activate'}</span>
                </>
              )}
            </button>

          </div>
        )}

        {/* Already registered? Login */}
        <div className="pt-2 text-center border-t border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-amber-400 hover:underline font-semibold"
          >
            {t.alreadyRegistered} {t.signIn}
          </button>
        </div>
      </div>
    </div>
  ));
};

