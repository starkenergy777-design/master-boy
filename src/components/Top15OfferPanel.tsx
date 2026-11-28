import React, { useEffect, useState } from 'react';
import type { Language } from '../types.js';
import type { Top15Offer } from '../../server/types.js';
import { api } from '../api.js';
import { translations, formatLocalizedDateTime } from '../i18n.js';

type Form = {cityId:string;professionId:string;amount:string;limit:string;months:string};
const blank:Form={cityId:'',professionId:'',amount:'',limit:'',months:''};
const formFor=(offer:Top15Offer):Form=>({cityId:offer.cityId||'',professionId:offer.professionId||'',amount:(offer.amountMinor/100).toFixed(2),limit:String(offer.limit),months:String(offer.durationMonths)});

export const Top15OfferPanel:React.FC<{lang:Language;cities:{id:string;name:string}[];professions:{id:string;name:string}[];locked:boolean}> = ({lang,cities,professions,locked}) => {
  const t=translations[lang].top15Offer;
  const [offers,setOffers]=useState<Top15Offer[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [form,setForm]=useState<Form>({...blank});
  const [version,setVersion]=useState<number>();
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const selected=offers.find(o=>o.id===selectedId);
  const dirty=!selected || JSON.stringify(form)!==JSON.stringify(formFor(selected));
  const select=(id:string, rows=offers)=>{
    const offer=rows.find(o=>o.id===id);
    setSelectedId(offer?.id||'');setVersion(offer?.version);setForm(offer?formFor(offer):{...blank});setError('');setNotice('');
  };
  const reload=async(id=selectedId)=>{
    const rows=await api.getTop15Offers();setOffers(rows);select(id,rows);return rows;
  };
  useEffect(()=>{
    let stopped=false;
    api.getTop15Offers().then(rows=>{
      if(stopped)return;
      setOffers(rows);const offer=rows.find(o=>o.status==='ACTIVE')||rows[0];
      if(offer){setSelectedId(offer.id);setForm(formFor(offer));setVersion(offer.version);}
    }).catch(err=>{if(!stopped)setError(err.message);}).finally(()=>{if(!stopped)setLoading(false);});
    const timer=window.setInterval(()=>{if(document.hidden)return;api.getTop15Offers().then(rows=>{if(!stopped)setOffers(rows);}).catch(()=>{});},5000);
    return()=>{stopped=true;window.clearInterval(timer);};
  },[]);
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy||locked)return;
    if(!/^\d+(?:\.\d{1,2})?$/.test(form.amount)||!/^\d+$/.test(form.limit)||!/^\d+$/.test(form.months)||Number(form.limit)<1||Number(form.months)<1||Number(form.months)>120){setError(t.invalid);return;}
    setBusy(true);setError('');setNotice('');
    try{
      const result=await api.saveTop15Offer({cityId:form.cityId||null,professionId:form.professionId||null,amountMinor:Math.round(Number(form.amount)*100),limit:Number(form.limit),durationMonths:Number(form.months),version},selectedId||undefined);
      await reload(result.id);setNotice(t.saved);
    }catch(err:any){setError(err.message);}finally{setBusy(false);}
  };
  const setStatus=async(status:'ACTIVE'|'PAUSED')=>{
    if(!selected||busy||locked)return;
    setBusy(true);setError('');setNotice('');
    try{await api.setTop15OfferStatus(selected.id,selected.version,status);await reload(selected.id);setNotice(t.saved);}
    catch(err:any){setError(err.message);}finally{setBusy(false);}
  };
  const field='w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-50';
  return <section className="border-t border-slate-700 pt-4 space-y-3 text-xs" aria-label={t.title}>
    <h4 className="font-bold text-amber-300">{t.title}</h4><p className="text-slate-400 leading-relaxed">{t.scope}</p>
    <label className="block space-y-1"><span>{t.history}</span><select className={field} value={selectedId} disabled={busy||loading} onChange={e=>select(e.target.value)}><option value="">{t.newOffer}</option>{offers.map(o=><option key={o.id} value={o.id}>{formatLocalizedDateTime(lang,o.createdAt)} · {t[o.status]} · {o.used}/{o.limit}</option>)}</select></label>
    {loading&&<p role="status">{t.loading}</p>}
    {selected&&<div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-3">
      {([[t.status,t[selected.status]],[t.used,selected.used],[t.remaining,selected.remaining],[t.pending,selected.pending]] as const).map(([label,value])=><div key={label} className="min-w-0"><p className="text-slate-400">{label}</p><output className="font-bold text-amber-300">{value}</output></div>)}
    </div>}
    <form onSubmit={save} className="space-y-3">
      <label className="block space-y-1"><span>{t.city}</span><select className={field} disabled={busy||locked} value={form.cityId} onChange={e=>setForm(f=>({...f,cityId:e.target.value}))}><option value="">{t.allCities}</option>{cities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="block space-y-1"><span>{t.profession}</span><select className={field} disabled={busy||locked} value={form.professionId} onChange={e=>setForm(f=>({...f,professionId:e.target.value}))}><option value="">{t.allProfessions}</option>{professions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {(['amount','limit','months'] as const).map(key=><label key={key} className="block space-y-1"><span>{key==='amount'?t.price:key==='limit'?t.limit:t.months}</span><input className={field} type="number" required disabled={busy||locked} min={key==='amount'?0:1} max={key==='months'?120:key==='limit'?2147483647:21474836.47} step={key==='amount'?'0.01':1} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}/></label>)}
      <p className="text-slate-400 leading-relaxed">{t.listing}</p>
      {dirty&&selected&&<p className="text-amber-300">{t.unsaved}</p>}
      {selected&&selected.version!==version&&<p role="status" className="text-amber-300">{t.changed}</p>}
      <button type="submit" disabled={busy||locked||loading} className="w-full rounded-xl bg-amber-400 px-3 py-3 font-bold text-slate-950 disabled:opacity-50">{busy?'…':t.save}</button>
    </form>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!selected||busy||locked||dirty||selected.version!==version||selected.remaining<=0||selected.status==='ACTIVE'} onClick={()=>setStatus('ACTIVE')} className="min-h-10 flex-1 rounded-xl border border-emerald-500 px-3 py-2 text-emerald-300 disabled:opacity-40">{t.activate}</button>
      <button type="button" disabled={!selected||busy||locked||selected.status!=='ACTIVE'} onClick={()=>setStatus('PAUSED')} className="min-h-10 flex-1 rounded-xl border border-amber-500 px-3 py-2 text-amber-300 disabled:opacity-40">{t.pause}</button>
      <button type="button" disabled={busy} onClick={()=>{setError('');reload().catch(err=>setError(err.message));}} className="min-h-10 rounded-xl border border-slate-600 px-3 py-2 disabled:opacity-40">{t.reload}</button>
    </div>
    {error&&<p role="alert" className="text-rose-300">{error}</p>}{notice&&<p role="status" className="text-emerald-300">{notice}</p>}
  </section>;
};
