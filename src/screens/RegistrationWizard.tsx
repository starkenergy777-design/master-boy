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
              <label className="text