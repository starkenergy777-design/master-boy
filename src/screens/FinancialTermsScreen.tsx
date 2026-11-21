import React from 'react';
import type { Language } from '../types.js';
import { FINANCIAL_TERMS_VERSION, termsFor } from '../financialTerms.js';

export const FinancialTermsScreen: React.FC<{ lang: Language; onBack: () => void }> = ({ lang, onBack }) => {
  const terms = termsFor(lang);
  return <main className="flex-1 p-4 pb-20 space-y-4 text-slate-100">
    <button type="button" onClick={onBack} className="text-sm text-amber-400">← {lang === 'ka' ? 'უკან' : lang === 'ru' ? 'Назад' : 'Back'}</button>
    <h1 className="text-xl font-bold">{terms.title}</h1>
    <p className="text-xs text-slate-400">{FINANCIAL_TERMS_VERSION}</p>
    <p className="text-sm leading-relaxed text-slate-300">{terms.introduction}</p>
    {terms.sections.map(([heading, body]) => <section key={heading} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2">
      <h2 className="font-semibold text-amber-400">{heading}</h2>
      <p className="text-sm leading-relaxed text-slate-300">{body}</p>
    </section>)}
  </main>;
};
