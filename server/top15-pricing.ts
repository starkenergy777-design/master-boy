import { db } from './db.js';
import { storage } from './storage.js';
import { activeTop15Offer, matchesOfferCategory, offerSnapshot, top15ServiceEnd } from './top15-offers.js';
import type { Top15OfferSnapshot } from './types.js';

export interface Top15Quote {
  amountMinor: number;
  currency: string;
  specialOffer: Top15OfferSnapshot | null;
  durationMonths?: number;
}
export async function quoteTop15(cityId: string, professionId: string, userId?: string): Promise<Top15Quote | null> {
  const ordinary=db.top15Prices.get(`${cityId}:${professionId}`);
  if (!ordinary) return null;
  const normal:Top15Quote={amountMinor:ordinary.amountMinor,currency:ordinary.currency,specialOffer:null};
  if (!userId) return normal;
  const c=[...db.craftsmen.values()].find(c=>c.userId===userId);
  if (!c || c.status!=='ACTIVE' || db.users.get(userId)?.status!=='ACTIVE' || c.cityId!==cityId || c.professionId!==professionId || db.getActiveTop15Memberships().some(m=>m.craftsmanId===c.id)) return normal;
  const offer=await storage.readTop15OfferData(sql=>activeTop15Offer(sql,userId),null);
  if (!offer || offer.participantUsed || !matchesOfferCategory(offer,cityId,professionId) || offer.used+offer.pending>=offer.limit) return normal;
  const listing=db.getCraftsmanListing(c.id);
  if (!listing || listing.status!=='ACTIVE' || !listing.expiresAt || Date.parse(listing.expiresAt)<top15ServiceEnd(Date.now(),offer)) return normal;
  return {amountMinor:offer.amountMinor,currency:offer.currency,specialOffer:offerSnapshot(offer),durationMonths:offer.durationMonths};
}
