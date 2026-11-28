import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Top15Offer, Top15OfferSnapshot, Top15Membership } from './types.js';
import { TOP15_TERM_MS } from './financial.js';

type Sql = Pick<Pool | PoolClient, 'query'>;
export class Top15OfferError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
export const offerError = (code: string, status = 409): never => { throw new Top15OfferError(code, status); };

// Offer months follow Georgia's civil calendar (Asia/Tbilisi, UTC+04:00).
// Set day 1 before changing month, then clamp to the target month's last day.
export function addOfferMonths(start: number, months: number): number {
  if (!Number.isFinite(start) || !Number.isInteger(months) || months < 1 || months > 120) return offerError('INVALID_OFFER', 400);
  const offset = 4 * 60 * 60 * 1000;
  const civil = new Date(start + offset), day = civil.getUTCDate();
  civil.setUTCDate(1);
  civil.setUTCMonth(civil.getUTCMonth() + months);
  const last = new Date(Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth() + 1, 0)).getUTCDate();
  civil.setUTCDate(Math.min(day, last));
  return civil.getTime() - offset;
}
export const top15ServiceEnd = (start: number, offer?: Top15OfferSnapshot | null) => offer ? addOfferMonths(start, offer.durationMonths) : start + TOP15_TERM_MS;
export const offerSnapshot = (offer: Top15Offer): Top15OfferSnapshot => ({ id: offer.id, version: offer.version, amountMinor: offer.amountMinor, currency: offer.currency, durationMonths: offer.durationMonths });
export const sameOffer = (a: Top15OfferSnapshot | null | undefined, b: Top15OfferSnapshot | null | undefined) => !a && !b || !!a && !!b && a.id === b.id && a.version === b.version && a.amountMinor === b.amountMinor && a.currency === b.currency && a.durationMonths === b.durationMonths;
export const matchesOfferCategory = (offer: Top15Offer, cityId: string, professionId: string) => (!offer.cityId || offer.cityId === cityId) && (!offer.professionId || offer.professionId === professionId);

// A pending bank order keeps its claim even if the initial checkout hold expires.
const liveClaim = `(r.status='PENDING' AND (r.expires_at>now() OR EXISTS(SELECT 1 FROM public.payment_intents pi WHERE pi.reservation_id=r.id AND pi.status='PENDING')))`;
const pendingSelect = `(SELECT count(*)::integer FROM public.top15_offer_uses ou JOIN public.top15_reservations r ON r.id=ou.reservation_id WHERE ou.offer_id=o.id AND ou.status='HELD' AND ${liveClaim})`;
const offerRow = (r: any): Top15Offer => ({ id:r.id,cityId:r.city_id,professionId:r.profession_id,amountMinor:Number(r.amount_minor),currency:r.currency,limit:Number(r.activation_limit),durationMonths:Number(r.duration_months),used:Number(r.used_count),pending:Number(r.pending || 0),remaining:Math.max(0,Number(r.activation_limit)-Number(r.used_count)),status:r.status,version:Number(r.version),createdAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString() });

export async function listTop15Offers(sql: Sql): Promise<Top15Offer[]> {
  const result = await sql.query(`SELECT o.*,${pendingSelect} AS pending FROM public.top15_offers o ORDER BY o.created_at DESC,o.id`);
  return result.rows.map(offerRow);
}
export async function activeTop15Offer(sql: Sql, userId?: string): Promise<(Top15Offer & {participantUsed:boolean}) | null> {
  try {
    const result = await sql.query(`SELECT o.*,${pendingSelect} AS pending,EXISTS(SELECT 1 FROM public.top15_offer_uses ou LEFT JOIN public.top15_reservations r ON r.id=ou.reservation_id WHERE ou.offer_id=o.id AND ou.user_id=$1 AND (ou.status='ACTIVATED' OR ou.status='HELD' AND ${liveClaim})) AS participant_used FROM public.top15_offers o WHERE o.status='ACTIVE' AND o.used_count<o.activation_limit LIMIT 1`,[userId||null]);
    return result.rows[0] ? {...offerRow(result.rows[0]),participantUsed:result.rows[0].participant_used} : null;
  } catch (error: any) {
    // An additive migration must not interrupt the existing ordinary checkout.
    if (error.code === '42P01') return null;
    throw error;
  }
}
export async function participantUsedOffer(sql: Sql, offerId: string, userId: string): Promise<boolean> {
  const result = await sql.query(`SELECT 1 FROM public.top15_offer_uses ou LEFT JOIN public.top15_reservations r ON r.id=ou.reservation_id WHERE ou.offer_id=$1 AND ou.user_id=$2 AND (ou.status='ACTIVATED' OR ou.status='HELD' AND ${liveClaim}) LIMIT 1`, [offerId,userId]);
  return result.rows.length > 0;
}
export async function auditOffer(sql: Sql, actorId: string, action: string, offerId: string, metadata: unknown) {
  await sql.query(`INSERT INTO public.audit_logs(id,actor_type,actor_id,action,target_type,target_id,metadata,created_at) VALUES($1,'USER',$2,$3,'TOP15_OFFER',$4,$5::jsonb,now())`, [randomUUID(),actorId,action,offerId,JSON.stringify(metadata)]);
}

export interface OfferInput { cityId: string | null; professionId: string | null; amountMinor: number; limit: number; durationMonths: number }
export function validateOfferInput(input: any): OfferInput {
  if (!input || ![input.amountMinor,input.limit,input.durationMonths].every(Number.isSafeInteger) || input.amountMinor<0 || input.amountMinor>2147483647 || input.limit<1 || input.limit>2147483647 || input.durationMonths<1 || input.durationMonths>120 || (input.cityId != null && (typeof input.cityId !== 'string'||input.cityId.length>64)) || (input.professionId != null && (typeof input.professionId !== 'string'||input.professionId.length>64))) return offerError('INVALID_OFFER',400);
  return {cityId:input.cityId||null,professionId:input.professionId||null,amountMinor:input.amountMinor,limit:input.limit,durationMonths:input.durationMonths};
}
export async function saveTop15Offer(sql: Sql, actorId: string, input: OfferInput, id?: string, version?: number): Promise<string> {
  const config = validateOfferInput(input);
  if (config.cityId && !(await sql.query('SELECT 1 FROM public.cities WHERE id=$1 AND is_active=true',[config.cityId])).rows.length) return offerError('INVALID_CATEGORY',400);
  if (config.professionId && !(await sql.query('SELECT 1 FROM public.professions WHERE id=$1 AND is_active=true',[config.professionId])).rows.length) return offerError('INVALID_CATEGORY',400);
  if (id) {
    const result = await sql.query('SELECT o.* FROM public.top15_offers o WHERE id=$1 FOR UPDATE',[id]);
    if (!result.rows.length) return offerError('OFFER_NOT_FOUND',404);
    const previous = offerRow(result.rows[0]);
    if (previous.version !== version) return offerError('OFFER_CHANGED');
    const pending = (await sql.query(`SELECT ${pendingSelect} AS pending FROM public.top15_offers o WHERE o.id=$1`,[id])).rows[0].pending;
    if (config.limit < previous.used + Number(pending)) return offerError('OFFER_LIMIT_TOO_LOW',400);
    await sql.query(`UPDATE public.top15_offers SET city_id=$2,profession_id=$3,amount_minor=$4,activation_limit=$5,duration_months=$6,version=version+1,updated_by=$7,updated_at=now(),status=CASE WHEN $5=used_count THEN 'COMPLETED' WHEN status='COMPLETED' THEN 'PAUSED' ELSE status END WHERE id=$1`,[id,config.cityId,config.professionId,config.amountMinor,config.limit,config.durationMonths,actorId]);
  } else {
    id=randomUUID();
    await sql.query(`INSERT INTO public.top15_offers(id,city_id,profession_id,amount_minor,activation_limit,duration_months,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$7)`,[id,config.cityId,config.professionId,config.amountMinor,config.limit,config.durationMonths,actorId]);
  }
  await auditOffer(sql,actorId,'TOP15_OFFER_SAVE',id,config);
  return id;
}
export async function changeTop15OfferStatus(sql: Sql, actorId: string, id: string, version: number, status: string) {
  if (!['ACTIVE','PAUSED'].includes(status)) return offerError('INVALID_OFFER',400);
  // Serialize activation of different campaigns before taking individual row locks.
  await sql.query("SELECT pg_advisory_xact_lock(hashtext('masterboy.top15.offer-control'))");
  const result=await sql.query('SELECT * FROM public.top15_offers WHERE id=$1 FOR UPDATE',[id]);
  if (!result.rows.length) return offerError('OFFER_NOT_FOUND',404);
  const offer=offerRow(result.rows[0]);
  if (offer.version!==version) return offerError('OFFER_CHANGED');
  if (status==='ACTIVE' && offer.used>=offer.limit) return offerError('OFFER_EXHAUSTED');
  if (status==='ACTIVE' && (await sql.query("SELECT 1 FROM public.top15_offers WHERE status='ACTIVE' AND id<>$1",[id])).rows.length) return offerError('OTHER_OFFER_ACTIVE');
  await sql.query('UPDATE public.top15_offers SET status=$2,version=version+1,updated_by=$3,updated_at=now() WHERE id=$1',[id,status,actorId]);
  await auditOffer(sql,actorId,'TOP15_OFFER_'+status,id,{status});
}

export async function lockTop15Category(sql: Sql, cityId: string, professionId: string) {
  const category=await sql.query('SELECT id FROM public.top15_prices WHERE city_id=$1 AND profession_id=$2 FOR UPDATE',[cityId,professionId]);
  if (!category.rows.length) return offerError('PRICE_NOT_SET',404);
}
export async function assertTop15Capacity(sql: Sql, cityId: string, professionId: string, excludeReservations: string[] = []) {
  const result=await sql.query(`SELECT (SELECT count(*) FROM public.top15_memberships m JOIN public.craftsmen c ON c.id=m.craftsman_id WHERE m.city_id=$1 AND m.profession_id=$2 AND m.status='ACTIVE' AND m.expires_at>now() AND c.status IN ('ACTIVE','EXPIRED') AND c.city_id=m.city_id AND c.profession_id=m.profession_id) + (SELECT count(*) FROM public.top15_reservations r WHERE r.city_id=$1 AND r.profession_id=$2 AND NOT(r.id=ANY($3::varchar[])) AND ${liveClaim}) AS occupied`,[cityId,professionId,excludeReservations]);
  return Number(result.rows[0].occupied);
}
async function lockedOffer(sql: Sql, snapshot: Top15OfferSnapshot, cityId: string, professionId: string): Promise<Top15Offer> {
  const result=await sql.query('SELECT o.* FROM public.top15_offers o WHERE o.id=$1 FOR UPDATE',[snapshot.id]);
  const offer=result.rows[0] && offerRow(result.rows[0]);
  if (!offer || offer.status!=='ACTIVE' || offer.used>=offer.limit || !sameOffer(snapshot,offerSnapshot(offer)) || !matchesOfferCategory(offer,cityId,professionId)) return offerError('TOP15_PRICE_CHANGED');
  return offer;
}
async function eligibleParticipant(sql: Sql, userId: string, craftsmanId: string, cityId: string, professionId: string, end: number) {
  const result=await sql.query(`SELECT c.id,c.city_id,c.profession_id,c.status,u.status AS user_status,l.status AS listing_status,l.expires_at FROM public.users u JOIN public.craftsmen c ON c.user_id=u.id JOIN public.craftsman_listings l ON l.craftsman_id=c.id WHERE u.id=$1 AND c.id=$2 AND 'CRAFTSMAN'=ANY(u.roles) AND EXISTS(SELECT 1 FROM public.cities WHERE id=c.city_id AND is_active=true) AND EXISTS(SELECT 1 FROM public.professions WHERE id=c.profession_id AND is_active=true) FOR UPDATE OF u,c,l`,[userId,craftsmanId]);
  const c=result.rows[0];
  if (!c || c.status!=='ACTIVE' || c.user_status!=='ACTIVE') return offerError('NOT_A_CRAFTSMAN',403);
  if (c.city_id!==cityId || c.profession_id!==professionId) return offerError('CATEGORY_MISMATCH',403);
  if (c.listing_status!=='ACTIVE' || new Date(c.expires_at).getTime()<end) return offerError('OFFER_LISTING_TERM_TOO_SHORT',403);
  if ((await sql.query("SELECT 1 FROM public.top15_memberships WHERE craftsman_id=$1 AND status='ACTIVE' AND expires_at>now()",[craftsmanId])).rows.length) return offerError('ALREADY_ACTIVE');
  if ((await sql.query("SELECT 1 FROM public.payment_intents WHERE craftsman_id=$1 AND product_type='TOP15' AND status='PENDING'",[craftsmanId])).rows.length) return offerError('BOG_CHECKOUT_PENDING');
}
async function assertOfferBudget(sql: Sql, offer: Top15Offer, userId: string) {
  if (await participantUsedOffer(sql,offer.id,userId)) return offerError('OFFER_ALREADY_USED');
  const pending=Number((await sql.query(`SELECT ${pendingSelect} AS pending FROM public.top15_offers o WHERE o.id=$1`,[offer.id])).rows[0].pending);
  if (offer.used+pending>=offer.limit) return offerError('OFFER_EXHAUSTED');
}
export async function completeOfferUse(sql: Sql, offerId: string, userId: string, membership: Top15Membership) {
  const updated=await sql.query(`UPDATE public.top15_offer_uses SET status='ACTIVATED',membership_id=$3,starts_at=$4,expires_at=$5,updated_at=now() WHERE offer_id=$1 AND user_id=$2 AND status='HELD' RETURNING id`,[offerId,userId,membership.id,membership.startsAt,membership.expiresAt]);
  if (!updated.rows.length) return offerError('OFFER_CLAIM_NOT_FOUND');
  const counter=await sql.query(`UPDATE public.top15_offers SET used_count=used_count+1,status=CASE WHEN used_count+1>=activation_limit THEN 'COMPLETED' ELSE status END,updated_at=now() WHERE id=$1 AND used_count<activation_limit RETURNING id`,[offerId]);
  if (!counter.rows.length) return offerError('OFFER_EXHAUSTED');
  await auditOffer(sql,userId,'TOP15_OFFER_ACTIVATED',offerId,{membershipId:membership.id,startsAt:membership.startsAt,expiresAt:membership.expiresAt,amountMinor:membership.specialOffer?.amountMinor});
}
export async function claimPaidOffer(sql: Sql, userId: string, reservation: {id:string;craftsmanId:string;cityId:string;professionId:string;specialOffer?:Top15OfferSnapshot|null}) {
  if (!reservation.specialOffer) return;
  const offer=await lockedOffer(sql,reservation.specialOffer,reservation.cityId,reservation.professionId);
  await eligibleParticipant(sql,userId,reservation.craftsmanId,reservation.cityId,reservation.professionId,top15ServiceEnd(Date.now(),reservation.specialOffer));
  await assertOfferBudget(sql,offer,userId);
  // Publish this hold inside the transaction before another winner in the
  // same payment batch checks the shared campaign budget.
  await sql.query("UPDATE public.top15_reservations SET status='PENDING' WHERE id=$1",[reservation.id]);
  await sql.query(`INSERT INTO public.top15_offer_uses(id,offer_id,user_id,craftsman_id,reservation_id,status,snapshot) VALUES($1,$2,$3,$4,$5,'HELD',$6::jsonb) ON CONFLICT(offer_id,user_id) DO UPDATE SET reservation_id=EXCLUDED.reservation_id,status='HELD',snapshot=EXCLUDED.snapshot,updated_at=now() WHERE top15_offer_uses.status<>'ACTIVATED'`,[randomUUID(),offer.id,userId,reservation.craftsmanId,reservation.id,JSON.stringify(reservation.specialOffer)]);
}
export async function activateFreeOffer(sql: Sql, userId: string, craftsmanId: string, cityId: string, professionId: string, expected: Top15OfferSnapshot): Promise<Top15Membership> {
  await lockTop15Category(sql,cityId,professionId);
  // A committed activation can be replayed without consuming a second place.
  const previous=await sql.query(`SELECT m.* FROM public.top15_offer_uses ou JOIN public.top15_memberships m ON m.id=ou.membership_id WHERE ou.offer_id=$1 AND ou.user_id=$2 AND ou.status='ACTIVATED'`,[expected.id,userId]);
  if (previous.rows.length) {
    const m=previous.rows[0];
    if (m.craftsman_id!==craftsmanId || m.city_id!==cityId || m.profession_id!==professionId || m.special_offer?.amountMinor!==0 || m.status!=='ACTIVE' || new Date(m.expires_at).getTime()<=Date.now()) return offerError('OFFER_ALREADY_USED');
    return {id:m.id,craftsmanId,cityId,professionId,cityName:'',professionName:'',status:m.status,startsAt:new Date(m.starts_at).toISOString(),expiresAt:new Date(m.expires_at).toISOString(),specialOffer:m.special_offer};
  }
  const offer=await lockedOffer(sql,expected,cityId,professionId);
  if (offer.amountMinor!==0) return offerError('TOP15_PRICE_CHANGED');
  const start=Date.now(),end=top15ServiceEnd(start,expected);
  await eligibleParticipant(sql,userId,craftsmanId,cityId,professionId,end);
  await assertOfferBudget(sql,offer,userId);
  if (await assertTop15Capacity(sql,cityId,professionId)>=15) return offerError('TOP15_FULL');
  const membership:Top15Membership={id:randomUUID(),craftsmanId,cityId,professionId,cityName:'',professionName:'',status:'ACTIVE',startsAt:new Date(start).toISOString(),expiresAt:new Date(end).toISOString(),specialOffer:offerSnapshot(offer)};
  await sql.query(`INSERT INTO public.top15_memberships(id,craftsman_id,city_id,profession_id,status,starts_at,expires_at,created_at,special_offer) VALUES($1,$2,$3,$4,'ACTIVE',$5,$6,$5,$7::jsonb)`,[membership.id,craftsmanId,cityId,professionId,membership.startsAt,membership.expiresAt,JSON.stringify(membership.specialOffer)]);
  await sql.query(`INSERT INTO public.top15_offer_uses(id,offer_id,user_id,craftsman_id,status,snapshot) VALUES($1,$2,$3,$4,'HELD',$5::jsonb) ON CONFLICT(offer_id,user_id) DO UPDATE SET status='HELD',snapshot=EXCLUDED.snapshot,updated_at=now() WHERE top15_offer_uses.status<>'ACTIVATED'`,[randomUUID(),offer.id,userId,craftsmanId,JSON.stringify(membership.specialOffer)]);
  await completeOfferUse(sql,offer.id,userId,membership);
  return membership;
}
