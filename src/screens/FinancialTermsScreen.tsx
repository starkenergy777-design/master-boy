import React, { useEffect, useState } from 'react';
import type { Language } from '../types.js';
import { FINANCIAL_TERMS_VERSION, termsFor } from '../financialTerms.js';
import { api } from '../api.js';

export const FinancialTermsScreen: React.FC<{ lang: Language; onBack: () => void }> = ({ lang, onBack }) => {
  const terms = termsFor(lang);
  const [disclosure, setDisclosure] = useState<any>(null);
  useEffect(() => { api.getMerchantDisclosure().then(setDisclosure).catch(() => undefined); }, []);
  return <main className="flex-1 p-4 pb-20 space-y-4 text-slate-100">
    <button type="button" onClick={onBack} className="text-sm text-amber-400">← {lang === 'ka' ? 'უკან' : lang === 'ru' ? 'Назад' : 'Back'}</button>
    <h1 className="text-xl font-bold">{terms.title}</h1>
    <p className="text-xs text-slate-400">{FINANCIAL_TERMS_VERSION}</p>
    {disclosure && <section className="rounded-2xl border border-amber-500/30 bg-slate-900 p-4 space-y-1 text-sm text-slate-300"><h2 className="font-semibold text-amber-400">Master Boy — {lang === 'ka' ? 'საკონტაქტო და საიდენტიფიკაციო ინფორმაცია' : lang === 'ru' ? 'Контактная и идентификационная информация' : 'Contact and identification information'}</h2><p>{disclosure.legalName}</p><p>{lang === 'ka' ? 'საიდენტიფიკაციო კოდი' : lang === 'ru' ? 'Идентификационный код' : 'Identification code'}: {disclosure.identificationCode}</p><p>{disclosure.address}</p><p>{disclosure.phone} · {disclosure.email}</p></section>}
    <p className="text-sm leading-relaxed text-slate-300">{terms.introduction}</p>
    {terms.sections.map(([heading, body]) => <section key={heading} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2">
      <h2 className="font-semibold text-amber-400">{heading}</h2>
      <p className="text-sm leading-relaxed text-slate-300">{body}</p>
    </section>)}
  </main>;
};
