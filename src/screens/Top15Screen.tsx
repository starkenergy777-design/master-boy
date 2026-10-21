import { localizeTree } from '../i18n.js';
import React, { useState, useEffect } from 'react';
import { Star, Clock, ShieldCheck, CheckCircle2, AlertCircle, CreditCard, ChevronRight } from 'lucide-react';
import { translations } from '../i18n.js';
import { Language, City, Profession, PaymentProvider } from '../types.js';
import { api } from '../api.js';

interface Top15ScreenProps {
  lang: Language;
  onBack: () => void;
  onSuccess: () => void;
}

export const Top15Screen: React.FC<Top15ScreenProps> = ({
  lang,
  onBack,
  onSuccess,
}) => {
  const t = translations[lang] || translations.ka;
  const [cities, setCities] = useState<City[]>([]);
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [cityId, setCityId] = useState('');
  const [professionId, setProfessionId] = useState('');

  // Flow State
  const [availability, setAvailability] = useState<{ freeSlots: number; amountMinor: number; currency: string } | null>(null);
  const [reservation, setReservation] = useState<{ reservationId: string; ttlSeconds: number; amountMinor: number; currency: string } | null>(null);
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [craftsmanProfile, setCraftsmanProfile] = useState<any>(null);

  useEffect(() => {
    async function loadMeta() {
      try {
        const [cList, pList, myProfile] = await Promise.all([
          api.getCities(),
          api.getProfessions(),
          api.getMyCraftsman().catch(() => null),
        ]);
        setCities(cList);
        setProfessions(pList);
        if (myProfile && myProfile.craftsman) {
          setCraftsmanProfile(myProfile.craftsman);
          setCityId(myProfile.craftsman.cityId);
          setProfessionId(myProfile.craftsman.professionId);
        } else {
          if (cList.length > 0) setCityId(cList[0].id);
          if (pList.length > 0) setProfessionId(pList[0].id);
        }
      } catch (e) {
        console.error(e);
      }
    }
    loadMeta();
  }, []);

  // Check Availability (§4.2 step 2)
  const checkAvailability = async () => {
    if (!cityId || !professionId) return;
    setErrorMsg('');
    try {
      setLoading(true);
      const res = await api.getTop15Availability(cityId, professionId);
      setAvailability(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error checking availability');
      setAvailability(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cityId && professionId) {
      checkAvailability();
    }
  }, [cityId, professionId]);

  // Hold Countdown Timer (§4.2 step 3)
  useEffect(() => {
    let timer: any;
    if (reservation && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            setReservation(null);
            setErrorMsg(lang === 'ka' ? 'დაჯავშნის 3-წუთიანი დრო ამოიწურა. სცადეთ თავიდან.' : 'Reservation time expired (3 mins).');
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [reservation, countdown]);

  // Reserve Slot (§4.2 step 3 & 4)
  const handleReserve = async () => {
    setErrorMsg('');
    try {
      setLoading(true);
      const res = await api.reserveTop15Slot(cityId, professionId);
      const provs = await api.getPaymentProviders();
      setReservation(res);
      setCountdown(res.ttlSeconds || 180);
      setProviders(provs);
      setSelectedProviderId('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reserve slot');
    } finally {
      setLoading(false);
    }
  };

  // Pay Slot with Idempotency Key (§4.2 step 5)
  const handlePay = async () => {
    if (!reservation || !selectedProviderId) return;
    setErrorMsg('');
    try {
      setLoading(true);
      const idempotencyKey = `idem-${reservation.reservationId}-${Date.now()}`;
      const payRes = await api.payTop15(reservation.reservationId, selectedProviderId, idempotencyKey);
      if (payRes.status === 'SUCCEEDED') {
        setIsSuccess(true);
      } else {
        setErrorMsg('Payment could not be completed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (isSuccess) {
    return localizeTree(lang, (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 animate-fade-in text-slate-100">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-950/40">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-black text-white">
          {lang === 'ka' ? 'გილოცავთ! TOP 15 გააქტიურებულია' : 'Success! Top 15 Activated'}
        </h2>
        <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
          {lang === 'ka'
            ? 'თქვენი პროფილი გამოჩნდება რჩეულთა სიაში პრიორიტეტულად მომდევნო 30 დღის განმავლობაში.'
            : 'Your craftsman profile will be prioritized in the Top 15 block for the next 30 days.'}
        </p>

        <button
          onClick={onSuccess}
          className="w-full max-w-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl shadow mt-4 text-xs"
        >
          {lang === 'ka' ? 'კაბინეტში დაბრუნება' : 'Back to Dashboard'}
        </button>
      </div>
    ));
  }

  return localizeTree(lang, (
    <div className="flex-1 flex flex-col p-4 pb-20 justify-between animate-fade-in text-slate-100">
      <div className="space-y-4">
        {/* Status Header Badge */}
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/30 flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 fill-amber-400" />
            <span>{t.reserveSlot}</span>
          </span>
          <span className="text-[11px] text-slate-400 font-medium">
            30-დღიანი პრიორიტეტული განთავსება
          </span>
        </div>

        {/* Hero Card */}
        <div className="bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-900 border border-amber-500/40 rounded-3xl p-4 shadow-md">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            <h3 className="text-sm font-black text-white">{t.top15Badge}</h3>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            {t.top15Desc}
          </p>
        </div>

        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-center gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Step 1 & 2: Category Selection & Availability */}
        {!reservation ? (
          <div className="space-y-3 bg-slate-900 border border-slate-800 rounded-3xl p-4">
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 space-y-1">
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                თქვენი რეგისტრაციის განყოფილება:
              </span>
              <p className="text-xs font-bold text-white">
                {cities.find(c => c.id === cityId)?.name || '...'} • {professions.find(p => p.id === professionId)?.name || '...'}
              </p>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                წესების მიხედვით, ხელოსანს Top 15-ში ადგილის ყიდვის უფლება აქვს მხოლოდ თავისი რეგისტრაციის ქალაქისა და პროფესიის განყოფილებაში.
              </p>
            </div>

            {/* Live Availability Status */}
            {availability && (
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">{t.freeSlots}:</span>
                  <span className={`font-bold ${availability.freeSlots > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {availability.freeSlots} / 15 {availability.freeSlots > 0 ? 'თავისუფალია' : 'სავსეა'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">{t.price}:</span>
                  <span className="font-bold text-white font-mono text-sm">
                    {(availability.amountMinor / 100).toFixed(2)} {availability.currency} (30 დღე)
                  </span>
                </div>

                {availability.freeSlots > 0 ? (
                  <button
                    onClick={handleReserve}
                    disabled={loading}
                    className="w-full mt-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-bold py-3 rounded-xl shadow text-xs transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? '...' : `${t.reserveSlot} (3 min hold)`}
                  </button>
                ) : (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-center text-rose-300 text-xs space-y-1">
                    <p className="font-bold">⚠️ Top 15 ამჟამად შევსებულია (15/15)</p>
                    <p className="text-[11px] text-slate-400">
                      ადგილის შეძენის უფლება გექნებათ, როდესაც რომელიმე ხელოსანს გაუვა 30 დღიანი ვადა.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Step 3, 4, 5: Slot Held -> Provider Select -> Pay */
          <div className="space-y-4 bg-slate-900 border border-slate-800 rounded-3xl p-4">
            {/* 3-Minute Hold Countdown Banner (§4.2 step 3) */}
            <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400 animate-pulse" />
                <div>
                  <span className="text-xs font-bold text-white block">
                    {t.minutesHold}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {t.holdCountdown}
                  </span>
                </div>
              </div>
              <div className="text-base font-black font-mono text-amber-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-amber-500/30">
                {formatCountdown(countdown)}
              </div>
            </div>

            {/* Provider Selection */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
                {t.providerSelect}
              </label>

              <div className="space-y-2">
                {providers.map((prov) => (
                  <div
                    key={prov.id}
                    onClick={() => setSelectedProviderId(prov.id)}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      selectedProviderId === prov.id
                        ? 'bg-amber-500/10 border-amber-500 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <CreditCard className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-semibold">{prov.name}</span>
                    </div>
                    {selectedProviderId === prov.id && (
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">თანხა გადასახდელად:</span>
              <span className="font-bold text-white font-mono text-base">
                {(reservation.amountMinor / 100).toFixed(2)} {reservation.currency}
              </span>
            </div>

            <button
              onClick={handlePay}
              disabled={loading || countdown <= 0}
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-400 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-950/40 text-xs transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{loading ? '...' : `${t.pay} • ${(reservation.amountMinor / 100).toFixed(2)} GEL`}</span>
            </button>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-slate-500 pt-4">
        {lang === 'ka'
          ? '3-წუთიანი დაჯავშნის რეზერვი • უსაფრთხო ონლაინ გადახდა'
          : '3-minute reservation hold • Secure online payment'}
      </p>
    </div>
  ));
};

