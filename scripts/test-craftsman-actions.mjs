import assert from 'node:assert/strict';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';

// Exercise real Express handlers, including bank order creation, without any
// external bank or database. The sandbox endpoints below are mocked in-process.
process.env.NODE_ENV = 'test';
for (const key of Object.keys(process.env)) if (/DATABASE|SUPABASE|PGHOST|PGPASSWORD/.test(key)) delete process.env[key];
process.env.APP_ORIGIN = 'https://isolated-craftsman.example.invalid';
process.env.BOG_PAYMENT_ENV = 'sandbox';
process.env.BOG_SANDBOX_CLIENT_ID = 'isolated-client';
process.env.BOG_SANDBOX_CLIENT_SECRET = 'isolated-secret';
const [{default:express},{apiRouter},{db,hashPassword},{storage},{durableApiResponses},{FINANCIAL_TERMS_VERSION}] = await Promise.all([
  import('express'),import('../.audit-build/routes.js'),import('../.audit-build/db.js'),import('../.audit-build/storage.js'),
  import('../.audit-build/deployment-lifecycle.js'),import('../.audit-build/financial.js'),
]);
const baseline = process.argv.includes('--baseline');
let sqlCount = 0, snapshots = 0, bankOrders = 0, failWrites = false, rejectRedirectSave = false;
const statements = [];
const query = async (sql,args=[]) => {
  sqlCount++; statements.push(sql);
  if (failWrites && /^(INSERT|UPDATE|DELETE)/.test(sql)) throw new Error('isolated storage failure');
  if (rejectRedirectSave && sql.startsWith('INSERT INTO public.payment_intents') && JSON.parse(args.at(-1)||'{}')?.redirectUrl) throw new Error('isolated redirect save failure');
  if (/financial_terms_accepted_at/.test(sql) && sql.includes('RETURNING')) return {rows:[{financial_terms_accepted_at:new Date().toISOString()}],rowCount:1};
  if (sql.includes('financial_cases') && sql.includes('RETURNING')) return {rows:[{id:args[0],craftsman_id:args[1],payment_intent_id:args[2],status:'OPEN'}],rowCount:1};
  return {rows:[],rowCount:1};
};
storage.pool = {query,connect:async()=>({query,release(){}})};
const save = db.persistRuntimeState.bind(db);
db.persistRuntimeState = async()=>{snapshots++;await save();};
db.bootstrap.enabled = false;
db.merchantDisclosure = {legalName:'Isolated merchant',identificationCode:'00000000000',address:'Test',phone:'+995555000000',email:'test@example.invalid'};
db.providerConfig.ai.configured = false;
db.providerConfig.payment.find(p=>p.id==='prov-bog').isActive = true;
const realFetch = fetch;
const bankOrdersByKey = new Map();
globalThis.fetch = async(url,options) => {
  const host = new URL(String(url)).hostname;
  if(host==='oauth2-sandbox.bog.ge') return Response.json({access_token:'isolated-token'});
  if(host==='api-sandbox.bog.ge') {
    const key=options.headers['Idempotency-Key'];
    if(!bankOrdersByKey.has(key)) bankOrdersByKey.set(key,`isolated-bank-${++bankOrders}`);
    const id=bankOrdersByKey.get(key);return Response.json({id,_links:{redirect:{href:`https://payment-sandbox.bog.ge/?order_id=${id}`}}});
  }
  throw new Error('External network disabled in craftsman action test');
};
function fixture(suffix, profile=true) {
  const now = new Date().toISOString();
  const user={id:`user-${suffix}`,phone:`+9955558${String(db.users.size).padStart(5,'0')}`,password:hashPassword('Isolated-password-123'),roles:['CRAFTSMAN'],status:'ACTIVE',createdAt:now};
  db.users.set(user.id,user);
  const token=`session-${suffix}`;db.sessions.set(token,{userId:user.id,createdAt:Date.now()});
  const c={id:`craftsman-${suffix}`,userId:user.id,name:'Test',description:'',phone:user.phone,phoneVisible:true,cityId:'city-tbilisi',professionId:'prof-plumber',status:'ACTIVE',photos:[],workingHours:{monday:'09:00-18:00'},financialTermsVersion:FINANCIAL_TERMS_VERSION,financialTermsAcceptedAt:now,createdAt:now,updatedAt:now};
  if(profile){db.craftsmen.set(c.id,c);db.craftsmanListings.set(c.id,{id:`listing-${suffix}`,craftsmanId:c.id,cityId:c.cityId,professionId:c.professionId,status:'ACTIVE',startsAt:now,expiresAt:new Date(Date.now()+180*86400000).toISOString(),createdAt:now,updatedAt:now});}
  return {user,c,token};
}
const owner=fixture('owner');
const app=express();app.use(express.json());
app.use(durableApiResponses({assertWriter:async()=>{},persist:()=>db.persistRuntimeState(),isDraining:()=>false,onPersistenceFailure:()=>{}}));
app.use('/api/v1',apiRouter);
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}/api/v1`;
const measurements=[];
async function action(label,path,{method='POST',body={},token=owner.token,status=200,headers={},bounded=true}={}) {
  const before={sqlCount,snapshots,time:performance.now()};
  const response=await realFetch(origin+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...headers},body:JSON.stringify(body)});
  const data=await response.json();
  assert.equal(response.status,status,`${label}: ${JSON.stringify(data)}`);
  const measurement={label,queries:sqlCount-before.sqlCount,snapshots:snapshots-before.snapshots,ms:Math.round(performance.now()-before.time)};
  measurements.push(measurement);
  if(!baseline&&bounded){assert.equal(measurement.snapshots,0,`${label} must not rewrite unrelated business data`);assert.ok(measurement.queries<25,`${label} must use bounded SQL`);}
  return data;
}
const registration = suffix=>({phone:`+9955557${suffix}`,password:'Isolated-password-123',name:'Test registration',cityId:'city-tbilisi',professionId:'prof-plumber',bankAccount:'GE00ISOLATED',paid:true,providerId:'prov-bog',checkoutProof:'a'.repeat(64),financialTermsAccepted:true,financialTermsVersion:FINANCIAL_TERMS_VERSION});
try {
  await action('wizard draft','/craftsmen/me/draft',{method:'PUT',body:{step:2,data:{name:'Draft'}}});
  await action('phone visibility','/craftsmen/me',{method:'PUT',body:{phoneVisible:false}});assert.equal(owner.c.phoneVisible,false);
  await action('profile save','/craftsmen/me',{method:'PUT',body:{name:'Updated profile',description:'Updated'}});
  await action('terms already accepted','/craftsmen/me/financial-terms/accept');
  owner.c.financialTermsVersion=null;
  await action('terms acceptance','/craftsmen/me/financial-terms/accept');
  const photo=await action('photo add','/craftsmen/me/photos',{body:{url:'https://example.com/photo.jpg',isPrimary:true}});
  await action('photo replace',`/craftsmen/me/photos/${photo.id}`,{method:'PUT',body:{url:'https://example.com/updated.jpg'}});
  await action('photo delete',`/craftsmen/me/photos/${photo.id}`,{method:'DELETE'});
  const reservation=await action('reserve slot','/top15/reserve',{body:{cityId:owner.c.cityId,professionId:owner.c.professionId}});
  assert.equal(reservation.ttlSeconds,180);
  const checkout=await action('listing bank redirect','/craftsmen/me/listing/pay',{status:202,body:{providerId:'prov-bog',financialTermsAccepted:true,financialTermsVersion:FINANCIAL_TERMS_VERSION},headers:{'Idempotency-Key':'isolated-listing-request'}});
  assert.match(checkout.redirectUrl,/^https:\/\/payment-sandbox.bog.ge\//);
  assert.equal(statements.at(-1),'COMMIT','the redirect response must follow its durable transaction');
  const countBeforeRetry=bankOrders;
  const retry=await action('renewal retries pending listing','/craftsmen/me/listing/renew',{status:202,body:{providerId:'prov-bog',financialTermsAccepted:true,financialTermsVersion:FINANCIAL_TERMS_VERSION},headers:{'Idempotency-Key':'isolated-renewal-request'}});
  assert.equal(retry.redirectUrl,checkout.redirectUrl);assert.equal(bankOrders,countBeforeRetry);
  const top15=await action('Top15 bank redirect (includes 10s arbitration)','/top15/pay',{status:202,body:{reservationId:reservation.reservationId,providerId:'prov-bog',financialTermsAccepted:true,financialTermsVersion:FINANCIAL_TERMS_VERSION},headers:{'Idempotency-Key':'isolated-top15-request'}});
  assert.match(top15.redirectUrl,/^https:\/\/payment-sandbox.bog.ge\//);
  assert.equal(db.getActiveTop15Memberships(owner.c.cityId,owner.c.professionId).length,0,'checkout cannot grant an unpaid membership');
  const orderCount=bankOrders;
  const replay=await action('Top15 retry','/top15/pay',{status:202,body:{reservationId:reservation.reservationId,providerId:'prov-bog',financialTermsAccepted:true,financialTermsVersion:FINANCIAL_TERMS_VERSION},headers:{'Idempotency-Key':'isolated-top15-request'}});
  assert.equal(replay.redirectUrl,top15.redirectUrl);assert.equal(bankOrders,orderCount);
  await action('payment case','/financial/cases',{status:201,body:{paymentIntentId:checkout.id,reason:'OTHER',description:'Isolated request for payment review.'}});
  await action('support message','/support/messages',{body:{text:'Test support message'}});
  await action('paid registration redirect','/auth/craftsman/register',{status:202,body:registration('00001')});
  const draftOwner=fixture('draft-owner',false);
  await action('signed-in paid registration redirect','/craftsmen/register',{status:202,token:draftOwner.token,body:registration('00002')});
  db.listingPrice.amountMinor=0;
  await action('free registration','/auth/craftsman/register',{status:201,body:{...registration('00003'),paid:false}});
  const freeOwner=fixture('free-owner',false);
  await action('signed-in free registration','/craftsmen/register',{token:freeOwner.token,body:{...registration('00004'),paid:false}});
  if(!baseline){
    db.listingPrice.amountMinor=1000;
    const checkoutOwner=fixture('checkout-failure');
    const paymentBody={providerId:'prov-bog',financialTermsAccepted:true,financialTermsVersion:FINANCIAL_TERMS_VERSION};
    rejectRedirectSave=true;
    const deniedRedirect=await action('failed redirect persistence','/craftsmen/me/listing/pay',{token:checkoutOwner.token,status:503,body:paymentBody,headers:{'Idempotency-Key':'isolated-failed-redirect'}});
    assert.equal(deniedRedirect.redirectUrl,undefined);
    const ordersBeforeRecovery=bankOrders;rejectRedirectSave=false;
    await action('retry after failed redirect persistence','/craftsmen/me/listing/pay',{token:checkoutOwner.token,status:202,body:paymentBody,headers:{'Idempotency-Key':'isolated-failed-redirect'}});
    assert.equal(bankOrders,ordersBeforeRecovery,'a retry must reuse the bank order key instead of opening another charge');
    const previousDraft=db.craftsmanDrafts.get(owner.user.id);
    failWrites=true;
    const previousName=owner.c.name;
    await action('failed profile save','/craftsmen/me',{method:'PUT',status:503,body:{name:'Must not publish'}});
    assert.equal(owner.c.name,previousName);
    await action('failed draft save','/craftsmen/me/draft',{method:'PUT',status:503,body:{step:3,data:{name:'Must not publish'}}});
    assert.deepEqual(db.craftsmanDrafts.get(owner.user.id),previousDraft);
    const ticketsBefore=db.top15Reservations.size;
    const reserveOwner=fixture('failed-reservation');
    await action('failed reservation save','/top15/reserve',{token:reserveOwner.token,status:503,body:{cityId:reserveOwner.c.cityId,professionId:reserveOwner.c.professionId}});
    assert.equal(db.top15Reservations.size,ticketsBefore);
    failWrites=false;
  }
  console.log(JSON.stringify({mode:baseline?'before':'after',prices:db.top15Prices.size,bankOrders,measurements},null,2));
  console.log('PASS: craftsman actions, durable bank redirects, retry deduplication, consent and no unpaid activation');
} finally {globalThis.fetch=realFetch;await new Promise(resolve=>server.close(resolve));}
