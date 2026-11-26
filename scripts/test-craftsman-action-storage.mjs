import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
process.env.NODE_ENV='test';
for(const key of Object.keys(process.env)) if(/DATABASE|SUPABASE|PGHOST|PGPASSWORD/.test(key)) delete process.env[key];
const {StorageService}=await import('../.audit-build/storage.js');
const postgres=await PGlite.create();
const store=new StorageService();
let rejectSql=()=>false;
const query=async(sql,args)=>{
  if(rejectSql(sql,args)) throw new Error('isolated transaction failure');
  // Match node-postgres array encoding for custom enum[] parameter types.
  const values=args?.map(value=>Array.isArray(value)?'{'+value.map(item=>JSON.stringify(String(item))).join(',')+'}':value);
  const r=await postgres.query(sql,values);return {...r,rowCount:r.affectedRows??r.rows.length};
};
store.pool={query,connect:async()=>({query,release(){}})};
const now=new Date().toISOString();
function records(id){
  const user={id:`user-${id}`,phone:`+99555500000${id}`,password:'scrypt-test-fixture',roles:['CRAFTSMAN'],status:'ACTIVE',createdAt:now};
  const c={id:`craftsman-${id}`,userId:user.id,name:'Fixture',description:'Original',phone:user.phone,phoneVisible:true,cityId:'city',professionId:'profession',workingHours:{monday:'09:00-18:00'},status:'ACTIVE',bankAccount:'GE00FIXTURE',photos:[],createdAt:now,updatedAt:now};
  const listing={id:`listing-${id}`,craftsmanId:c.id,cityId:'city',professionId:'profession',status:'ACTIVE',startsAt:now,expiresAt:'2027-05-25T12:00:00.000Z',graceEndsAt:'2027-06-24T12:00:00.000Z',createdAt:now,updatedAt:now};
  return {user,c,listing};
}
async function one(table,id,column='id'){return (await postgres.query(`SELECT * FROM public.${table} WHERE ${column}=$1`,[id])).rows[0];}
try{
  await postgres.exec((await readFile(new URL('../migrations/001_initial_schema.sql',import.meta.url),'utf8')).replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',''));
  for(const file of ['003_advertisements_schema.sql','004_runtime_storage.sql','011_hard_delete_craftsmen_and_reconcile_top15.sql','012_admin_share_percentage.sql','014_top15_candidate_reservations.sql','015_financial_terms_and_cases.sql','017_bog_payment_checkout.sql']) await postgres.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  await postgres.exec("INSERT INTO cities(id,name_ka,name_ru,name_en,lat,lng) VALUES('city','Test','Test','Test',41,44); INSERT INTO professions(id,name_ka,name_ru,name_en) VALUES('profession','Test','Test','Test');");
  const target=records('1'),other=records('2');
  let committed=false;
  rejectSql=sql=>sql.startsWith('INSERT INTO public.craftsman_listings');
  await assert.rejects(store.saveFreeCraftsmanRegistration(target.user,target.c,target.listing,false,()=>{committed=true;}),/isolated/);
  assert.equal(committed,false);assert.equal(await one('users',target.user.id),undefined);assert.equal(await one('craftsmen',target.c.id),undefined);
  rejectSql=()=>false;
  await store.saveFreeCraftsmanRegistration(target.user,target.c,target.listing,false,()=>{committed=true;});
  await store.saveFreeCraftsmanRegistration(other.user,other.c,other.listing,false,()=>{});
  assert.equal(committed,true);assert.equal((await one('craftsman_listings',target.listing.id)).expires_at.toISOString(),target.listing.expiresAt);
  const unrelated={user:await one('users',other.user.id),craftsman:await one('craftsmen',other.c.id),listing:await one('craftsman_listings',other.listing.id)};
  let savedDraft;
  const draft={step:2,data:{name:'Draft',photoUrl:'https://example.com/a.jpg'},updatedAt:now};
  await store.saveCraftsmanDraft(target.user.id,draft,()=>{savedDraft=draft;});
  assert.equal((await one('craftsman_drafts',target.user.id,'user_id')).step,2);
  rejectSql=sql=>sql.startsWith('INSERT INTO public.craftsman_drafts');
  await assert.rejects(store.saveCraftsmanDraft(target.user.id,{...draft,step:3},()=>{savedDraft=null;}),/isolated/);
  assert.equal(savedDraft,draft);assert.equal((await one('craftsman_drafts',target.user.id,'user_id')).step,2);
  rejectSql=()=>false;
  await Promise.all([
    store.updateCraftsmanProfile(target.c.id,target.user.id,{name:'Updated'},now,()=>{}),
    store.updateCraftsmanProfile(target.c.id,target.user.id,{phoneVisible:false},now,()=>{}),
  ]);
  let profile=await one('craftsmen',target.c.id);assert.equal(profile.name,'Updated');assert.equal(profile.phone_visible,false);assert.equal(profile.description,'Original');
  rejectSql=sql=>sql.startsWith('UPDATE public.craftsmen');
  await assert.rejects(store.updateCraftsmanProfile(target.c.id,target.user.id,{name:'Lost update'},now,()=>{throw new Error('must not publish');}),/isolated/);
  assert.deepEqual(await one('craftsmen',target.c.id),profile);rejectSql=()=>false;
  const photo={id:'photo',craftsmanId:target.c.id,url:'https://example.com/a.jpg',isPrimary:true,displayOrder:0,createdAt:now,updatedAt:now};
  await store.saveCraftsmanPhoto(photo,target.user.id,()=>{});
  assert.equal(await one('craftsman_drafts',target.user.id,'user_id'),undefined,'photo save must persist the same draft removal it publishes in memory');
  assert.equal((await one('craftsman_photos','photo')).url,photo.url);
  const reservation={id:'reservation',craftsmanId:target.c.id,cityId:'city',professionId:'profession',amountMinor:150,currency:'GEL',expiresAt:Date.now()+180000,status:'CANDIDATE'};
  await store.saveTop15Candidate(reservation,()=>{});assert.equal((await one('top15_reservations','reservation')).status,'CANDIDATE');
  reservation.status='HELD';reservation.expiresAt+=600000;
  await store.saveTop15ReservationStates(()=>[reservation]);
  const held=await one('top15_reservations','reservation');assert.equal(held.status,'PENDING');assert.equal(held.expires_at.getTime(),reservation.expiresAt);assert.equal(held.amount_minor,150);
  reservation.status='CANCELLED';await store.saveTop15ReservationStates(()=>[reservation]);assert.equal((await one('top15_reservations','reservation')).status,'CANCELLED');
  const messages=[{id:'user-message',craftsmanId:target.c.id,sender:'CRAFTSMAN',body:'Question',flaggedForHuman:false,createdAt:now},{id:'reply-message',craftsmanId:target.c.id,sender:'AI_ADMIN',body:'Reply',flaggedForHuman:false,createdAt:now}];
  rejectSql=(sql,args)=>sql.startsWith('INSERT INTO public.support_messages')&&args[0]==='reply-message';
  await assert.rejects(store.saveSupportMessages(messages,()=>{throw new Error('must not publish');}),/isolated/);
  assert.equal(await one('support_messages','user-message'),undefined);rejectSql=()=>false;
  await store.saveSupportMessages(messages,()=>{});assert.equal((await one('support_messages','reply-message')).body,'Reply');
  assert.deepEqual(await one('users',other.user.id),unrelated.user);assert.deepEqual(await one('craftsmen',other.c.id),unrelated.craftsman);assert.deepEqual(await one('craftsman_listings',other.listing.id),unrelated.listing);
  const existing=records('3');await query('INSERT INTO users(id,phone,password_hash,roles,status,created_at) VALUES($1,$2,$3,$4::user_role[],$5::user_status,$6)',[existing.user.id,existing.user.phone,existing.user.password,existing.user.roles,existing.user.status,now]);
  await store.saveCraftsmanDraft(existing.user.id,draft,()=>{});
  await store.saveFreeCraftsmanRegistration({...existing.user,password:'new-hash'},existing.c,existing.listing,true,()=>{});
  assert.equal((await one('users',existing.user.id)).password_hash,'new-hash');assert.equal(await one('craftsman_drafts',existing.user.id,'user_id'),undefined);
  console.log('PASS: actual PostgreSQL registration/draft/profile/photo/reservation/chat transactions, rollback, partial update ordering and unrelated profile/expiry preservation');
}finally{await postgres.close();}
