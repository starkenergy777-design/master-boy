import React, { useState } from 'react';
import { api } from '../api.js';
import type { Language } from '../types.js';

type CaseItem = { id: string; craftsman_id: string; payment_intent_id: string; reason: string; description: string; status: string; decision_reason: string | null; approved_refund_minor: number | null; refund_estimate_minor?: number | null; created_at: string };

export function FinancialCasesAdmin({ lang }: { lang: Language }) {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { status: string; reason: string; refund: string; reference: string }>>({});

  const load = async () => {
    setError('');
    try { setCases(await api.getAdminFinancialCases()); setLoaded(true); }
    catch (caught: any) { setError(caught.message || 'Could not load cases.'); }
  };
  const updateDraft = (id: string, patch: Partial<{status:string;reason:string;refund:string;reference:string}>) => {
    setDrafts(previous => ({ ...previous, [id]: { status: previous[id]?.status || 'REVIEWING', reason: previous[id]?.reason || '', refund: previous[id]?.refund || '', reference: previous[id]?.reference || '', ...patch } }));
  };
  const save = async (item: CaseItem) => {
    const draft = drafts[item.id];
    if (!draft) return;
    setError('');
    setSavingId(item.id);
    try {
      const amount = draft.refund === '' ? null : Math.round(Number(draft.refund) * 100);
      const updated = await api.reviewFinancialCase(item.id, draft.status, draft.reason, amount, draft.reference);
      setCases(previous => previous.map(value => value.id === item.id ? updated : value));
    } catch (caught: any) { setError(caught.message || 'Could not save decision.'); }
    finally { setSavingId(''); }
  };

  return <section className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4 space-y-3 text-xs">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold text-white">{lang === 'ka' ? 'ფინანსური დავები' : lang === 'ru' ? 'Финансовые споры' : 'Financial cases'}</h2><button type="button" onClick={load} className="text-cyan-300 underline">{lang === 'ka' ? 'განახლება' : 'Refresh'}</button></div>
    <p className="text-slate-400">{lang === 'ka' ? 'გადაწყვეტილება აღირიცხება; საბანკო დაბრუნება ამ ეკრანიდან არ სრულდება.' : 'Decisions are recorded; this screen does not send a bank refund.'}</p>
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    {loaded && cases.length === 0 && <p className="text-slate-400">{lang === 'ka' ? 'მოთხოვნები არ არის.' : 'No cases.'}</p>}
    {cases.map(item => { const draft = drafts[item.id] || { status: 'REVIEWING', reason: '', refund: '', reference: '' }; return <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 space-y-2">
      <p className="font-semibold text-white">{item.id} · {item.status}</p><p className="text-slate-400">{item.payment_intent_id} · {item.reason}</p><p className="whitespace-pre-wrap text-slate-200">{item.description}</p>
      {item.decision_reason && <p className="text-cyan-200">{item.decision_reason}</p>}
      {item.refund_estimate_minor != null && <p className="text-emerald-200">{lang === 'ka' ? 'საორიენტაციო დაბრუნება' : 'Estimated refund'}: {(item.refund_estimate_minor / 100).toFixed(2)} GEL</p>}
      <label className="block">{lang === 'ka' ? 'სტატუსი' : 'Status'}<select value={draft.status} onChange={event => updateDraft(item.id, { status: event.target.value })} className="block w-full bg-slate-950 border border-slate-700 rounded-lg p-2"><option value="REVIEWING">REVIEWING</option><option value="AWAITING_PROVIDER">AWAITING_PROVIDER</option><option value="APPROVED">APPROVED</option><option value="DECLINED">DECLINED</option><option value="CLOSED">CLOSED</option></select></label>
      <label className="block">{lang === 'ka' ? 'დასაბუთება' : 'Reason'}<textarea value={draft.reason} onChange={event => updateDraft(item.id, { reason: event.target.value })} minLength={10} maxLength={2000} rows={3} className="block w-full bg-slate-950 border border-slate-700 rounded-lg p-2" /></label>
      <label className="block">{lang === 'ka' ? 'დასამტკიცებელი თანხა (GEL)' : 'Approved amount (GEL)'}<input type="number" min="0" step="0.01" value={draft.refund} onChange={event => updateDraft(item.id, { refund: event.target.value })} className="block w-full bg-slate-950 border border-slate-700 rounded-lg p-2" /></label>
      <label className="block">{lang === 'ka' ? 'ბანკის დაბრუნების რეფერენსი (დახურვისას)' : 'Bank refund reference (on close)'}<input type="text" maxLength={128} value={draft.reference} onChange={event => updateDraft(item.id, { reference: event.target.value })} className="block w-full bg-slate-950 border border-slate-700 rounded-lg p-2" /></label>
      <button type="button" disabled={savingId === item.id || draft.reason.trim().length < 10} onClick={() => void save(item)} className="rounded-lg bg-cyan-500 px-3 py-2 font-bold text-slate-950 disabled:opacity-50">{lang === 'ka' ? 'გადაწყვეტილების შენახვა' : 'Save decision'}</button>
    </div>; })}
  </section>;
}
