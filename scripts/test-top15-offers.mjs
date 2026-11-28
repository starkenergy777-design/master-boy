import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
// No production connection, real account, SMS, bank transaction or provider call.
for(const key of Object.keys(process.env)) if(/DATABASE|SUPABASE|PGHOST|PGPASSWORD|BOG_|TBC_/.test(key))delete process.env[key];
process.env.NODE_ENV='test';delete process.env.PAYMENTS_SIMULATION;
const [{default:express},{apiRouter},{db},{storage},{durableApiResponses},terms,offers]=await Promise.all([
  import('express'),import('../.audit-build/routes.js'),import('../.audit-build/db.js'),import('../.audit-build/storage.js'),
  import('../.audit-build/deployment-lifecycle.js'),import('../.audit-build/financial.js'),import('../.audit-build/top15-offers.js')
]);
const pg=await PGlite.create();let tail=Promise.resolve(),failSql=()=>false,lastStatement='';
async function connect(){const previous=tail;let release;tail=new Promise(r=>{release=r;});await previous;return {query:async(sql,args)=>{
  lastStatement=sql;if(failSql(sql,args))throw Error('isolated offer write failure');
  const values=args?.map(value=>Array.isArray(value)?'{'+value.map(x=>JSON.stringify(String(x))).join(',')+'}':value);
  const result=await pg.query(sql,values);return {...result,rowCount:result.affectedRows??result.rows.length};
},release};}
const pool={connect,query:async(sql,args)=>{const client=await connect();try{return await client.query(sql,args);}finally{client.release();}}};
storage.pool=pool;
let server,snapshots=0,bankCalls=0;
const actualFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{if(!String(url).startsWith('http://127.0.0.1:')){bankCalls++;throw Error('External network disabled in offer test');}return actualFetch(url,options);};
const pass=name=>console.log('PASS: '+name);
const now=new Date().toISOString();
const categoryIds=[...db.top15Prices.values()].map(p=>({cityId:p.cityId,professionId:p.professionId}));
for(const map of [db.users,db.sessions,db.craftsmen,db.craftsmanListings,db.top15Memberships,db.top15Reservations,db.paymentIntents,db.advertisements,db.craftsmanDrafts])map.clear();
db.auditLog=[];db.aiReports=[];db.supportMessages=[];db.listingPurgeLog=[];
const people=[];
function authUser(id,roles,phone){const user={id,phone,password:'isolated-test-hash',roles,status:'ACTIVE',createdAt:now};db.users.set(id,user);db.sessions.set('session-'+id,{userId:id,createdAt:Date.now()});return user;}
const admin=authUser('offer-admin',['SUPER_ADMIN'],'+995555990000');
authUser('offer-staff',['ADMIN'],'+995555990001');
const app=express();app.use(express.json());app.use(durableApiResponses({assertWriter:async()=>{},persist:async()=>{snapshots++;await db.persistRuntimeState();},isDraining:()=>false,onPersistenceFailure:error=>console.error("Fixture snapshot failed:",error.message)}));app.use('/api/v1',apiRouter);
let base;
async function request(path,{method='GET',user=admin.id,body,expected=200,headers={}}={}){
  const response=await fetch(base+path,{method,headers:{...(user?{Authorization:'Bearer session-'+user}:{}),'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();assert.equal(response.status,expected,path+' '+JSON.stringify(data));return data;
}
const listed=()=>request('/admin/top15/offers');
const current=async id=>(await listed()).find(o=>o.id===id);
const write=async(id,patch)=>{const o=await current(id);await request('/admin/top15/offers/'+id,{method:'PUT',body:{cityId:o.cityId,professionId:o.professionId,amountMinor:o.amountMinor,limit:o.limit,durationMonths:o.durationMonths,version:o.version,...patch}});return current(id);};
const status=async(id,state)=>{const o=await current(id);await request('/admin/top15/offers/'+id+'/status',{method:'PATCH',body:{version:o.version,status:state}});return current(id);};
const quote=p=>request(`/top15/availability?cityId=${p.c.cityId}&professionId=${p.c.professionId}`,{user:p.user.id});
const activate=(p,snapshot,expected=200)=>request('/top15/reserve',{method:'POST',user:p.user.id,body:{cityId:p.c.cityId,professionId:p.c.professionId,specialOffer:snapshot,expectedAmountMinor:0},expected});
try{
  await pg.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
  await pg.exec((await readFile(new URL('../migrations/001_initial_schema.sql',import.meta.url),'utf8')).replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',''));
  for(const file of ['003_advertisements_schema.sql','004_runtime_storage.sql','008_ai_provider_secrets.sql','009_superadmin_provider_config_secrets.sql','011_hard_delete_craftsmen_and_reconcile_top15.sql','012_admin_share_percentage.sql','014_top15_candidate_reservations.sql','015_financial_terms_and_cases.sql','016_unipay_terms_consent.sql','017_bog_payment_checkout.sql','019_deployment_writer_fence.sql'])await pg.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../migrations/020_top15_special_offers.sql',import.meta.url),'utf8'));
  for(const c of db.cities)await pool.query('INSERT INTO cities(id,name_ka,name_ru,name_en,lat,lng,is_active) VALUES($1,$2,$3,$4,$5,$6,$7)',[c.id,c.name.ka,c.name.ru,c.name.en,c.lat,c.lng,c.isActive]);
  for(const p of db.professions)await pool.query('INSERT INTO professions(id,name_ka,name_ru,name_en) VALUES($1,$2,$3,$4)',[p.id,p.name.ka,p.name.ru,p.name.en]);
  await pool.query("INSERT INTO users(id,phone,password_hash,roles,status) VALUES($1,$2,'isolated-test-hash',ARRAY['SUPER_ADMIN']::user_role[],'ACTIVE')",[admin.id,admin.phone]);
  for(const p of db.top15Prices.values()){p.updatedBy=admin.id;await pool.query('INSERT INTO top15_prices(id,city_id,profession_id,amount_minor,currency,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[`${p.cityId}:${p.professionId}`,p.cityId,p.professionId,p.amountMinor,p.currency,admin.id,p.updatedAt]);}
  const ordinary=JSON.stringify((await pool.query('SELECT * FROM top15_prices ORDER BY id')).rows);
  for(let i=0;i<450;i++){
    const user=authUser('offer-user-'+i,['CRAFTSMAN'],'+995555'+String(i).padStart(6,'0'));
    const cat=categoryIds[Math.floor(i/15)];
    const c={id:'offer-craftsman-'+i,userId:user.id,name:'Isolated offer fixture '+i,description:'',phone:user.phone,phoneVisible:true,cityId:cat.cityId,professionId:cat.professionId,status:'ACTIVE',photos:[],workingHours:null,financialTermsVersion:terms.FINANCIAL_TERMS_VERSION,financialTermsAcceptedAt:now,createdAt:now,updatedAt:now};
    const listing={id:'offer-listing-'+i,craftsmanId:c.id,cityId:c.cityId,professionId:c.professionId,status:'ACTIVE',startsAt:now,expiresAt:new Date(Date.now()+180*86400000).toISOString(),createdAt:now,updatedAt:now};
    db.craftsmen.set(c.id,c);db.craftsmanListings.set(c.id,listing);people.push({user,c,listing});
  }
  const json=JSON.stringify(people.map(p=>({user_id:p.user.id,phone:p.user.phone,id:p.c.id,city:p.c.cityId,profession:p.c.professionId,listing_id:p.listing.id,expires:p.listing.expiresAt})));
  await pool.query(`INSERT INTO users(id,phone,password_hash,roles,status) SELECT user_id,phone,'isolated-test-hash',ARRAY['CRAFTSMAN']::user_role[],'ACTIVE' FROM jsonb_to_recordset($1::jsonb) AS x(user_id text,phone text)`,[json]);
  await pool.query(`INSERT INTO craftsmen(id,user_id,name,phone,city_id,profession_id,status,financial_terms_version,financial_terms_accepted_at) SELECT id,user_id,'Isolated offer fixture',phone,city,profession,'ACTIVE',$2,now() FROM jsonb_to_recordset($1::jsonb) AS x(id text,user_id text,phone text,city text,profession text)`,[json,terms.FINANCIAL_TERMS_VERSION]);
  await pool.query(`INSERT INTO craftsman_listings(id,craftsman_id,city_id,profession_id,status,starts_at,expires_at) SELECT listing_id,id,city,profession,'ACTIVE',now(),expires::timestamptz FROM jsonb_to_recordset($1::jsonb) AS x(listing_id text,id text,city text,profession text,expires text)`,[json]);
  db.configLock.locked=false;db.providerConfig.payment.forEach(p=>p.isActive=false);db.providerConfig.ai.configured=false;
  db.merchantDisclosure={legalName:'Isolated merchant',identificationCode:'00000000000',address:'Fixture',phone:'+995555990000',email:'fixture@example.invalid'};
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port+'/api/v1';
  await request('/admin/top15/offers',{user:null,expected:401});
  await request('/admin/top15/offers',{user:'offer-staff',expected:403});
  await request('/admin/top15/offers',{method:'POST',user:'offer-staff',body:{},expected:403});
  pass('offer administration is superadmin-only');
  const created=await request('/admin/top15/offers',{method:'POST',body:{cityId:null,professionId:null,amountMinor:0,limit:300,durationMonths:2},expected:201});
  let o=await current(created.id);assert.equal(o.used,0);assert.equal(o.remaining,300);assert.equal(o.status,'DRAFT');
  o=await status(o.id,'ACTIVE');
  for(const scope of [{cityId:null,professionId:null},{cityId:people[0].c.cityId,professionId:null},{cityId:null,professionId:people[0].c.professionId},{cityId:people[0].c.cityId,professionId:people[0].c.professionId}]){
    o=await write(o.id,scope);
    for(const p of [people[0],people[15],people[300]]){
      const q=await quote(p),matches=(!scope.cityId||scope.cityId===p.c.cityId)&&(!scope.professionId||scope.professionId===p.c.professionId);
      assert.equal(q.amountMinor,matches?0:db.top15Prices.get(p.c.cityId+':'+p.c.professionId).amountMinor);
      assert.equal(Boolean(q.specialOffer),matches);
    }
  }
  pass('all four optional city/profession scopes use the live catalog and preserve ordinary prices');
  o=await write(o.id,{cityId:null,professionId:null});
  const snapshot=(await quote(people[0])).specialOffer;
  assert.ok(snapshot);const bankBefore=bankCalls;
  await request('/top15/reserve',{method:'POST',user:null,body:{cityId:people[0].c.cityId,professionId:people[0].c.professionId,specialOffer:snapshot},expected:401});
  people[0].user.status='BLOCKED';await activate(people[0],snapshot,403);people[0].user.status='ACTIVE';
  await pool.query("UPDATE users SET status='BLOCKED' WHERE id=$1",[people[0].user.id]);
  await activate(people[0],snapshot,403);await pool.query("UPDATE users SET status='ACTIVE' WHERE id=$1",[people[0].user.id]);
  assert.equal((await current(o.id)).used,0);
  await activate(people[0],{...snapshot,version:snapshot.version+1},409);
  await activate(people[0],{...snapshot,durationMonths:99},409);
  await activate(people[0],{...snapshot,currency:'USD'},409);
  failSql=sql=>sql.startsWith('INSERT INTO public.top15_offer_uses');
  await activate(people[0],snapshot,503);failSql=()=>false;
  assert.equal((await current(o.id)).used,0);assert.equal(db.top15Memberships.size,0);
  assert.equal((await pool.query('SELECT count(*) AS n FROM top15_memberships')).rows[0].n,0);
  pass('forged quote and failed transaction create no membership or counter change');
  const first=await activate(people[0],snapshot);assert.equal(first.freeActivation,true);
  assert.equal(Date.parse(first.membership.expiresAt),offers.addOfferMonths(Date.parse(first.membership.startsAt),2));
  assert.equal(lastStatement,'COMMIT');assert.equal((await current(o.id)).used,1);
  await Promise.all(Array.from({length:5},()=>activate(people[0],snapshot)));
  assert.equal((await current(o.id)).used,1);assert.equal(db.top15Memberships.size,1);
  pass('zero-price activation works with every provider disabled and repeated clicks are idempotent');
  const previousExpiry=first.membership.expiresAt;
  const search=await request(`/search?cityId=${people[0].c.cityId}&professionId=${people[0].c.professionId}`,{user:null});
  assert.ok(search.top15.some(c=>c.id===people[0].c.id),'free active membership must appear in anonymous customer search');
  assert.ok(!JSON.stringify(search).includes('specialOffer'),'private purchase metadata is not a public profile field');
  pass('free membership is visible in anonymous search without publishing private offer metadata');
  o=await status(o.id,'PAUSED');assert.equal((await quote(people[1])).specialOffer,null);assert.equal(o.used,1);
  await activate(people[1],snapshot,409);
  o=await status(o.id,'ACTIVE');o=await write(o.id,{durationMonths:1});
  assert.equal(db.top15Memberships.get(first.membership.id).expiresAt,previousExpiry);
  o=await write(o.id,{durationMonths:2});
  const currentSnapshot=(await quote(people[1])).specialOffer;
  const short=people[449];const shortOriginal=short.listing.expiresAt;
  short.listing.expiresAt=new Date(Date.now()+31*86400000).toISOString();await pool.query('UPDATE craftsman_listings SET expires_at=$2 WHERE id=$1',[short.listing.id,short.listing.expiresAt]);
  assert.equal((await quote(short)).specialOffer,null);await activate(short,currentSnapshot,403);
  short.listing.expiresAt=shortOriginal;await pool.query('UPDATE craftsman_listings SET expires_at=$2 WHERE id=$1',[short.listing.id,shortOriginal]);
  pass('pause/resume preserves usage; settings never rewrite an activated term; full standard-listing coverage is required');
  const results=await Promise.all(people.slice(1,16).map(async p=>{
    const response=await fetch(base+'/top15/reserve',{method:'POST',headers:{Authorization:'Bearer session-'+p.user.id,'Content-Type':'application/json'},body:JSON.stringify({cityId:people[0].c.cityId,professionId:people[0].c.professionId,specialOffer:currentSnapshot,expectedAmountMinor:0})});return {status:response.status,data:await response.json()};
  }));
  // Users 1..14 are in the first category. User 15 is rejected for category mismatch.
  assert.equal(results.filter(r=>r.status===200).length,14);assert.equal((await current(o.id)).used,15);
  const overflow=people[448],originalCategory={cityId:overflow.c.cityId,professionId:overflow.c.professionId};
  Object.assign(overflow.c,{cityId:people[0].c.cityId,professionId:people[0].c.professionId});
  await pool.query('UPDATE craftsmen SET city_id=$2,profession_id=$3 WHERE id=$1',[overflow.c.id,overflow.c.cityId,overflow.c.professionId]);
  const full=await activate(overflow,currentSnapshot,409);assert.equal(full.code,'TOP15_FULL');assert.equal((await current(o.id)).used,15);
  Object.assign(overflow.c,originalCategory);await pool.query('UPDATE craftsmen SET city_id=$2,profession_id=$3 WHERE id=$1',[overflow.c.id,overflow.c.cityId,overflow.c.professionId]);
  pass('concurrent requests cannot allocate category place 16 or consume a failed activation');
  const beforeMove={cityId:people[1].c.cityId,professionId:people[1].c.professionId};
  Object.assign(people[1].c,{cityId:people[300].c.cityId,professionId:people[300].c.professionId});
  await pool.query('UPDATE craftsmen SET city_id=$2,profession_id=$3 WHERE id=$1',[people[1].c.id,people[1].c.cityId,people[1].c.professionId]);
  assert.equal((await quote(people[1])).specialOffer,null);assert.equal((await activate(people[1],currentSnapshot,409)).code,'OFFER_ALREADY_USED');
  Object.assign(people[1].c,beforeMove);await pool.query('UPDATE craftsmen SET city_id=$2,profession_id=$3 WHERE id=$1',[people[1].c.id,beforeMove.cityId,beforeMove.professionId]);
  const beforeEdit=await current(o.id);
  await request('/admin/top15/offers/'+o.id,{method:'PUT',body:{cityId:null,professionId:null,amountMinor:0,limit:14,durationMonths:2,version:beforeEdit.version},expected:400});
  await request('/admin/top15/offers/'+o.id,{method:'PUT',body:{cityId:null,professionId:null,amountMinor:0,limit:300,durationMonths:2,version:beforeEdit.version-1},expected:409});
  assert.equal((await current(o.id)).used,15);
  pass('changing category cannot bypass one-use eligibility; stale edits and lowering the limit below usage are rejected');
  const auditsBefore=(await pool.query("SELECT id,metadata FROM audit_logs WHERE target_type='TOP15_OFFER' ORDER BY id")).rows;
  await db.persistRuntimeState();
  assert.deepEqual((await pool.query("SELECT id,metadata FROM audit_logs WHERE target_type='TOP15_OFFER' ORDER BY id")).rows,auditsBefore);
  assert.equal((await current(o.id)).used,15);
  pass('existing runtime snapshots preserve campaign configuration, usage, metadata and SQL audit history');
  for(let i=15;i<299;i++)await activate(people[i],currentSnapshot);
  assert.equal((await current(o.id)).used,299);
  await activate(people[299],currentSnapshot);o=await current(o.id);assert.equal(o.used,300);assert.equal(o.remaining,0);assert.equal(o.status,'COMPLETED');
  await activate(people[300],currentSnapshot,409);assert.equal((await current(o.id)).used,300);
  assert.equal((await quote(people[300])).specialOffer,null);
  assert.equal((await pool.query('SELECT count(*)::integer AS n FROM top15_memberships')).rows[0].n,300);
  assert.equal((await pool.query('SELECT count(*)::integer AS n FROM payment_intents')).rows[0].n,0);
  assert.equal(bankCalls,bankBefore);
  pass('first, 299th and 300th activations succeed; 301st fails; ordinary price returns; no free bank call or payment record exists');
  const hydrated=await storage.loadRuntimeCollection('top15Memberships');assert.equal(hydrated[first.membership.id].specialOffer.durationMonths,2);assert.equal(hydrated[first.membership.id].expiresAt,previousExpiry);
  await pool.query('DELETE FROM users WHERE id=$1',[people[0].user.id]);db.users.delete(people[0].user.id);db.craftsmen.delete(people[0].c.id);db.craftsmanListings.delete(people[0].c.id);db.top15Memberships.delete(first.membership.id);
  assert.equal((await current(o.id)).used,300);assert.equal((await pool.query('SELECT count(*)::integer AS n FROM top15_offer_uses')).rows[0].n,300);
  assert.equal(JSON.stringify((await pool.query('SELECT * FROM top15_prices ORDER BY id')).rows),ordinary);
  pass('reload preserves source and dates; deleting an account preserves the global usage ledger and ordinary tariffs');
  assert.equal(new Date(offers.addOfferMonths(Date.parse('2027-01-30T22:15:00.000Z'),1)).toISOString(),'2027-02-27T22:15:00.000Z');
  assert.equal(new Date(offers.addOfferMonths(Date.parse('2028-01-31T08:00:00.000Z'),1)).toISOString(),'2028-02-29T08:00:00.000Z');
  assert.equal(new Date(offers.addOfferMonths(Date.parse('2026-12-31T08:00:00.000Z'),2)).toISOString(),'2027-02-28T08:00:00.000Z');
  pass('calendar months clamp leap-year, year-boundary and Georgian-midnight month ends correctly');
  const heldCampaign=await request('/admin/top15/offers',{method:'POST',body:{amountMinor:0,limit:10,durationMonths:1},expected:201});await status(heldCampaign.id,'ACTIVE');
  for(const p of people.slice(435,449)){
    const m={id:'preserved-position-'+p.user.id,craftsmanId:p.c.id,cityId:p.c.cityId,professionId:p.c.professionId,cityName:'Fixture',professionName:'Fixture',status:'ACTIVE',startsAt:now,expiresAt:new Date(Date.now()+30*86400000).toISOString()};
    await pool.query("INSERT INTO top15_memberships(id,craftsman_id,city_id,profession_id,status,starts_at,expires_at) VALUES($1,$2,$3,$4,'ACTIVE',$5,$6)",[m.id,m.craftsmanId,m.cityId,m.professionId,m.startsAt,m.expiresAt]);db.top15Memberships.set(m.id,m);
  }
  const holder=people[449],heldId='existing-held-position';
  const ordinaryMemberships=(await pool.query("SELECT id,status,starts_at,expires_at FROM top15_memberships WHERE id LIKE 'preserved-position-%' ORDER BY id")).rows;
  const held={id:heldId,craftsmanId:holder.c.id,cityId:holder.c.cityId,professionId:holder.c.professionId,amountMinor:1000,currency:'GEL',status:'HELD',expiresAt:Date.now()+180000};
  await pool.query("INSERT INTO top15_reservations(id,craftsman_id,city_id,profession_id,status,amount_minor,currency,expires_at) VALUES($1,$2,$3,$4,'PENDING',1000,'GEL',to_timestamp($5/1000.0))",[heldId,held.craftsmanId,held.cityId,held.professionId,held.expiresAt]);db.top15Reservations.set(held.id,held);
  const heldQuote=(await quote(holder)).specialOffer;assert.ok(heldQuote);
  assert.equal((await activate(holder,heldQuote,409)).code,'TOP15_FULL');assert.equal((await current(heldCampaign.id)).used,0);
  held.status='EXPIRED';held.expiresAt=Date.now()-1000;await pool.query("UPDATE top15_reservations SET status='EXPIRED',expires_at=now()-interval '1 second' WHERE id=$1",[held.id]);
  const activation=await activate(holder,heldQuote);assert.equal((await current(heldCampaign.id)).used,1);
  const expired=db.top15Memberships.get(activation.membership.id);expired.status='EXPIRED';expired.startsAt=new Date(Date.now()-62*86400000).toISOString();expired.expiresAt=new Date(Date.now()-1000).toISOString();
  await pool.query("UPDATE top15_memberships SET status='EXPIRED',starts_at=$2,expires_at=$3 WHERE id=$1",[expired.id,expired.startsAt,expired.expiresAt]);
  assert.equal((await quote(holder)).specialOffer,null);const replay=await activate(holder,heldQuote,409);assert.equal(replay.code,'OFFER_ALREADY_USED');assert.equal((await current(heldCampaign.id)).used,1);
  assert.equal(db.getActiveTop15Memberships(holder.c.cityId,holder.c.professionId).some(m=>m.id===expired.id),false);
  assert.equal((await pool.query('SELECT count(*)::integer AS n FROM payment_intents')).rows[0].n,0);assert.equal(bankCalls,bankBefore);
  await status(heldCampaign.id,'PAUSED');
  assert.deepEqual((await pool.query("SELECT id,status,starts_at,expires_at FROM top15_memberships WHERE id LIKE 'preserved-position-%' ORDER BY id")).rows,ordinaryMemberships);
  pass('existing active memberships and holds consume capacity; expiry never renews or refunds campaign quota and triggers no bank charge');
  // Exercise the existing bank adapter, arbitration and reconciliation code.
  // All bank responses are local synthetic responses; no bank URL is contacted.
  const bankOrders=new Map(),bankOutcomes=new Map();let createdBankOrders=0;
  process.env.APP_ORIGIN='https://offers-test.example.invalid';process.env.BOG_PAYMENT_ENV='sandbox';
  process.env.BOG_SANDBOX_CLIENT_ID='isolated-offer-client';process.env.BOG_SANDBOX_CLIENT_SECRET='isolated-offer-secret';
  db.providerConfig.payment.find(p=>p.id==='prov-bog').isActive=true;
  globalThis.fetch=async(url,options={})=>{
    const parsed=new URL(String(url));if(parsed.hostname==='127.0.0.1')return actualFetch(url,options);
    bankCalls++;
    if(parsed.hostname==='oauth2-sandbox.bog.ge')return Response.json({access_token:'isolated-offer-token'});
    if(parsed.hostname==='api-sandbox.bog.ge'){
      if(options.method==='POST'){
        const body=JSON.parse(options.body);const id='isolated-offer-bank-'+(++createdBankOrders);
        bankOrders.set(id,body);
        return Response.json({id,_links:{redirect:{href:'https://payment-sandbox.bog.ge/?order_id='+id}}});
      }
      const id=parsed.pathname.split('/').at(-1),order=bankOrders.get(id);assert.ok(order,'only a synthetic known bank order can be read');
      const outcome=bankOutcomes.get(id);
      return Response.json({order_id:id,external_order_id:order.external_order_id,order_status:{key:outcome==='FAILED'?'rejected':'completed'},purchase_units:{currency_code:'GEL',request_amount:String(order.purchase_units.total_amount),transfer_amount:String(outcome==='MISMATCH'?0.01:order.purchase_units.total_amount)}});
    }
    throw Error('External network disabled in offer test');
  };
  const paid=await request('/admin/top15/offers',{method:'POST',body:{cityId:null,professionId:null,amountMinor:250,limit:1,durationMonths:2},expected:201});await status(paid.id,'ACTIVE');
  const buyers=[people[400],people[401]];
  const paidQuote=await quote(buyers[0]),callsBeforeForgery=bankCalls;
  await activate(buyers[0],{...paidQuote.specialOffer,amountMinor:0},409);assert.equal(bankCalls,callsBeforeForgery);assert.equal((await current(paid.id)).used,0);
  const tickets=await Promise.all(buyers.map(async p=>{const q=await quote(p);assert.equal(q.amountMinor,250);return request('/top15/reserve',{method:'POST',user:p.user.id,body:{cityId:p.c.cityId,professionId:p.c.professionId,specialOffer:q.specialOffer,expectedAmountMinor:q.amountMinor}});}));
  const attempts=await Promise.all(buyers.map(async(p,index)=>{
    const response=await fetch(base+'/top15/pay',{method:'POST',headers:{Authorization:'Bearer session-'+p.user.id,'Content-Type':'application/json','Idempotency-Key':'isolated-offer-payment-'+index},body:JSON.stringify({reservationId:tickets[index].reservationId,providerId:'prov-bog',financialTermsAccepted:true,financialTermsVersion:terms.FINANCIAL_TERMS_VERSION})});return {status:response.status,data:await response.json(),buyer:p};
  }));
  assert.equal(attempts.filter(a=>a.status===202).length,1,JSON.stringify(attempts));assert.equal(attempts.filter(a=>a.status===409).length,1,JSON.stringify(attempts));assert.equal(createdBankOrders,1);
  const winner=attempts.find(a=>a.status===202);assert.equal((await current(paid.id)).used,0);assert.equal((await current(paid.id)).pending,1);
  const stored=db.paymentIntents.get(winner.data.paymentIntentId);assert.equal(stored.amountMinor,250);assert.equal(stored.providerCheckout.specialOffer.durationMonths,2);
  // Changing a pending offer must not rewrite a bank order already consented to.
  await status(paid.id,'PAUSED');await write(paid.id,{amountMinor:900,durationMonths:1});
  const settled=await request('/payments/bog/'+stored.id+'/status',{method:'POST',user:winner.buyer.user.id,body:{}});assert.equal(settled.status,'SUCCEEDED');
  const membership=[...db.top15Memberships.values()].find(m=>m.craftsmanId===winner.buyer.c.id);assert.ok(membership);assert.equal(membership.specialOffer.amountMinor,250);assert.equal(membership.specialOffer.durationMonths,2);
  assert.equal(Date.parse(membership.expiresAt),offers.addOfferMonths(Date.parse(membership.startsAt),2));
  assert.equal((await current(paid.id)).used,1);assert.equal((await current(paid.id)).pending,0);assert.equal((await current(paid.id)).status,'COMPLETED');
  await request('/payments/bog/'+stored.id+'/status',{method:'POST',user:winner.buyer.user.id,body:{}});assert.equal((await current(paid.id)).used,1);assert.equal(createdBankOrders,1);
  assert.equal((await pool.query("SELECT count(*)::integer AS n FROM payment_intents WHERE status='SUCCEEDED'")).rows[0].n,1);
  assert.equal((await pool.query('SELECT sum(amount_minor)::integer AS total FROM payment_intents')).rows[0].total,250);
  pass('paid campaign keeps the existing bank path: one last budget claim, one bank order, confirmed activation, immutable consent and idempotent reconciliation');
  const failedOffer=await request('/admin/top15/offers',{method:'POST',body:{amountMinor:250,limit:2,durationMonths:1},expected:201});await status(failedOffer.id,'ACTIVE');
  const failureBuyers=[people[405],people[406]];
  const failedTickets=await Promise.all(failureBuyers.map(async p=>{const q=await quote(p);assert.equal(q.specialOffer.id,failedOffer.id);return request('/top15/reserve',{method:'POST',user:p.user.id,body:{cityId:p.c.cityId,professionId:p.c.professionId,specialOffer:q.specialOffer,expectedAmountMinor:q.amountMinor}});}));
  const failedOrders=await Promise.all(failureBuyers.map((p,i)=>request('/top15/pay',{method:'POST',user:p.user.id,headers:{'Idempotency-Key':'isolated-failed-offer-'+i},body:{reservationId:failedTickets[i].reservationId,providerId:'prov-bog',financialTermsAccepted:true,financialTermsVersion:terms.FINANCIAL_TERMS_VERSION},expected:202})));
  assert.equal((await current(failedOffer.id)).pending,2);assert.equal((await current(failedOffer.id)).used,0);
  for(let i=0;i<failedOrders.length;i++){
    const intent=db.paymentIntents.get(failedOrders[i].paymentIntentId);bankOutcomes.set(intent.bankPaymentId,i===0?'FAILED':'MISMATCH');
    const result=await request('/payments/bog/'+intent.id+'/status',{method:'POST',user:failureBuyers[i].user.id,body:{}});assert.equal(result.status,i===0?'FAILED':'REVIEW');
    assert.equal([...db.top15Memberships.values()].some(m=>m.craftsmanId===failureBuyers[i].c.id),false);
  }
  assert.equal((await current(failedOffer.id)).used,0);assert.equal((await current(failedOffer.id)).pending,0);
  assert.equal((await pool.query("SELECT count(*)::integer AS n FROM top15_offer_uses WHERE offer_id=$1 AND status='CANCELLED'",[failedOffer.id])).rows[0].n,2);
  assert.equal((await pool.query("SELECT count(*)::integer AS n FROM financial_cases WHERE payment_intent_id=$1",[failedOrders[1].paymentIntentId])).rows[0].n,1);
  assert.equal((await quote(failureBuyers[0])).specialOffer.id,failedOffer.id);
  pass('failed and mismatched bank payments release pending claims without consuming campaign quota or activating service; mismatched funds enter existing financial review');
  await pool.query("SET ROLE anon");await assert.rejects(pool.query('SELECT * FROM top15_offers'),e=>e.code==='42501');await pool.query('RESET ROLE');
  const triggers=(await pool.query("SELECT count(*)::integer AS n FROM pg_trigger WHERE tgname='deployment_writer_fence' AND tgrelid IN ('public.top15_offers'::regclass,'public.top15_offer_uses'::regclass)")).rows[0].n;assert.equal(triggers,2);
  pass('anonymous Data API access is denied and both new tables retain deployment writer fencing');
  console.log('ALL TOP15 OFFER DATABASE AND HTTP CHECKS PASSED');
}catch(error){console.error(error.stack?.split('\n').slice(0,9).join('\n')||error.message);process.exitCode=1;}finally{globalThis.fetch=actualFetch;if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pg.close();}
