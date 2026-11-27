import React, { useEffect, useState } from 'react';
import type { Language } from '../types.js';
import { api } from '../api.js';
import { termsFor, FINANCIAL_TERMS_VERSION } from '../financialTerms.js';
import { informationFor, formatPublicPrice, type PlatformInformation } from '../platformInformation.js';

export const PlatformInformationScreen: React.FC<{ lang: Language; onBack: () => void }> = ({ lang, onBack }) => {
  const copy = informationFor(lang);
  const terms = termsFor(lang);
  const [data, setData] = useState<PlatformInformation | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    api.getPlatformInformation().then(result => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [lang, attempt]);
  const paragraphs = (items: readonly string[]) => items.map(text => <p key={text} className="text-sm leading-relaxed text-slate-300">{text}</p>);
  const sectionClass = 'rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3';
  const prices = data ? [...new Set(data.top15.map(formatPublicPrice))] : [];
  return <main className="w-full min-w-0 p-3 sm:p-4 space-y-4 text-slate-100 break-words">
    <button type="button" onClick={onBack} className="min-h-10 text-sm text-amber-400">← {copy.back}</button>
    <h1 className="text-xl font-bold">{copy.title}</h1>
    <nav aria-label={copy.title} className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-amber-300">
      {copy.headings.map((heading, index) => <a className="underline" href={`#information-${index}`} key={heading} onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); document.getElementById(`information-${index}`)?.scrollIntoView({ block: 'start' }); } }}>{heading}</a>)}
    </nav>
    <section id="information-0" className={sectionClass}><h2 className="font-semibold text-amber-400">1. {copy.headings[0]}</h2>{paragraphs(copy.about)}</section>
    <section id="information-1" className={sectionClass}><h2 className="font-semibold text-amber-400">2. {copy.headings[1]}</h2>
      {data && <dl className="space-y-2 text-sm text-slate-300">{Object.values(data.merchant).map((value, i) => <div key={copy.contactLabels[i]}><dt className="font-semibold">{copy.contactLabels[i]}</dt><dd>{i === 3 ? <a className="underline" href={`tel:${value}`}>{value}</a> : i === 4 ? <a className="underline break-all" href={`mailto:${value}`}>{value}</a> : value || '—'}</dd></div>)}</dl>}
      {!data && <p role={failed ? 'alert' : 'status'}>{failed ? copy.error : copy.loading}</p>}
      {failed && <button type="button" className="min-h-10 rounded-lg bg-amber-400 px-4 text-slate-950" onClick={() => setAttempt(a => a + 1)}>{copy.retry}</button>}
    </section>
    <section id="information-2" className={sectionClass}><h2 className="font-semibold text-amber-400">3. {copy.headings[2]}</h2>{paragraphs(copy.services)}</section>
    <section id="information-3" className={sectionClass}><h2 className="font-semibold text-amber-400">4. {copy.headings[3]}</h2>
      {data ? <><p className="text-sm">{copy.listing}: <strong>{formatPublicPrice(data.listing)}</strong></p><p className="text-sm">{copy.top15}: <strong>{prices.join(' / ') || copy.unavailable}</strong></p>
        {data.top15.length > 0 && <details><summary className="cursor-pointer py-2 text-sm text-amber-300">{copy.allPrices}</summary><table className="w-full table-fixed text-left text-xs"><thead><tr><th className="w-2/3 py-2">{copy.category}</th><th>{copy.price}</th></tr></thead><tbody>{data.top15.map(row => <tr key={`${row.city}:${row.profession}`} className="border-t border-slate-800"><td className="py-2 pr-2">{row.city} / {row.profession}</td><td>{formatPublicPrice(row)}</td></tr>)}</tbody></table></details>}</> : <p role="status">{failed ? copy.error : copy.loading}</p>}
      {paragraphs([copy.pricing])}
    </section>
    <section id="information-4" className={sectionClass}><h2 className="font-semibold text-amber-400">5. {copy.headings[4]}</h2>{paragraphs(copy.delivery)}
      <h3 className="font-semibold">{copy.financial}</h3><p className="text-xs text-slate-400">{FINANCIAL_TERMS_VERSION}</p>{paragraphs([terms.introduction])}
      {terms.sections.map(([title, body]) => <div key={title} className="space-y-2"><h4 className="text-sm font-semibold text-amber-200">{title}</h4>{paragraphs([body])}</div>)}
      <a href="/financial-terms" className="inline-block py-2 text-sm underline text-amber-300">{terms.title}</a>
    </section>
    <section id="information-5" className={sectionClass}><h2 className="font-semibold text-amber-400">6. {copy.headings[5]}</h2>{paragraphs(copy.privacy)}</section>
    <section id="information-6" className={sectionClass}><h2 className="font-semibold text-amber-400">7. {copy.headings[6]}</h2>{paragraphs(copy.usage)}</section>
  </main>;
};
