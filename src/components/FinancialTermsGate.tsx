import React, { useEffect, useState } from 'react';
import type { Language } from '../types.js';
import { api } from '../api.js';
import { FINANCIAL_TERMS_VERSION, termsFor } from '../financialTerms.js';

export function FinancialTermsGate({ lang }: { lang: Language }) {
  const [state, setState] = useState<'loading' | 'required' | 'accepted' | 'unavailable'>('loading');
  const [disclosure, setDisclosure] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([api.getFinancialTermsConsent(), api.getMerchantDisclosure()])
      .then(([consent, merchant]) => { setDisclosure(merchant); setState(consent.accepted ? 'accepted' : merchant.configured ? 'required' : 'unavailable'); })
      .catch(() => setState('unavailable'));
  }, []);
  if (state === 'loading' || state === 'accepted') return null;
  const ka = lang === 'ka'; const ru = lang === 'ru'; const terms = termsFor(lang);
  const accept = async () => { setBusy(true); setError(''); try { await api.acceptFinancialTerms(); setState('accepted'); } catch (e: any) { setError(e.message || 'Could not save acceptance.'); } finally { setBusy(false); } };
  return <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/95 p-3" role="dialog" aria-modal="true" aria-labelledby="financial-terms-title">
    <section className="flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-amber-500/40 bg-slate-900 shadow-2xl">
      <header className="border-b border-slate-700 p-4"><h1 id="financial-terms-title" className="text-lg font-bold text-white">{terms.title}</h1><p className="mt-1 text-xs text-amber-300">{ka ? 'ოპერაციების გასაგრძელებლად აუცილებელია წესებზე თანხმობა.' : ru ? 'Для продолжения необходимо принять условия.' : 'Acceptance is required before you can continue.'}</p></header>
      <div className="overflow-y-auto p-4 space-y-3 text-sm text-slate-300">
        {state === 'unavailable' ? <p className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-rose-200">{ka ? 'იურიდიული ინფორმაცია ჯერ არ გამოქვეყნებულა. ოპერაციები დროებით დაბლოკილია; დაუკავშირდით Master Boy-ს.' : ru ? 'Юридическая информация ещё не опубликована. Операции временно недоступны.' : 'Merchant information is not published yet. Operations are temporarily unavailable.'}</p> : <>
          <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs space-y-1"><p className="font-semibold text-amber-300">Master Boy</p><p>{disclosure?.legalName}</p><p>{ka ? 'საიდენტიფიკაციო კოდი' : ru ? 'Идентификационный код' : 'Identification code'}: {disclosure?.identificationCode}</p><p>{disclosure?.address}</p><p>{disclosure?.phone} · {disclosure?.email}</p></div>
          <p>{terms.introduction}</p>{terms.sections.map(([heading, body]) => <section key={heading}><h2 className="font-semibold text-amber-300">{heading}</h2><p className="mt-1 text-xs leading-relaxed">{body}</p></section>)}
        </>}
      </div>
      <footer className="border-t border-slate-700 p-4 space-y-2"><p className="text-[10px] text-slate-500">{FINANCIAL_TERMS_VERSION}</p>{error && <p role="alert" className="text-xs text-rose-300">{error}</p>}{state === 'required' && <button type="button" disabled={busy} onClick={accept} className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-60">{busy ? '…' : ka ? 'გავეცანი წესებს და ვეთანხმები' : ru ? 'Я ознакомился(-ась) с правилами и согласен(-на)' : 'I have read and agree to the terms'}</button>}</footer>
    </section>
  </div>;
}
