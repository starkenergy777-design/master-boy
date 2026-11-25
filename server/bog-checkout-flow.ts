import { createHash, randomUUID } from 'node:crypto';
import { createBankCheckout, getBankPaymentState, type BankCredentials, type BogEnvironment } from './bank-gateway.js';
import { db } from './db.js';
import { coversTop15Term, FINANCIAL_TERMS_VERSION, TOP15_TERM_MS } from './financial.js';
import { storage } from './storage.js';
import type { BogCheckout, Craftsman, CraftsmanListing, PaymentIntent, Top15Membership, Top15Reservation } from './types.js';

const DAY = 86_400_000;
const ORDER_TTL_MINUTES = 5;
const CHECKOUT_HOLD_MS = 10 * 60_000;
const UNLINKED_ORDER_TIMEOUT_MS = 15 * 60_000;
const locks = new Map<string, Promise<void>>();

export class BogCheckoutError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

function config(environment = getBogEnvironment(), newOrders = true): { credentials: BankCredentials; environment: BogEnvironment; origin: string } | null {
  const provider = db.providerConfig.payment.find(item => item.id === 'prov-bog');
  if (newOrders && (!provider?.isActive || !storage.getStatus().databaseConfigured)) return null;
  const clientId = environment === 'sandbox' ? process.env.BOG_SANDBOX_CLIENT_ID : provider?.clientId;
  const secretKey = environment === 'sandbox' ? process.env.BOG_SANDBOX_CLIENT_SECRET : provider?.secretKey;
  if (!clientId || !secretKey) return null;
  try {
    const url = new URL(process.env.APP_ORIGIN || process.env.APP_URL || 'https://master-boy.onrender.com');
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (newOrders && ((environment === 'live' && process.env.NODE_ENV !== 'production') ||
        (environment === 'sandbox' && url.hostname === 'master-boy.onrender.com'))) return null;
    return { credentials: { clientId, secretKey }, origin: url.origin, environment };
  } catch { return null; }
}

export function getBogEnvironment(): BogEnvironment {
  return process.env.BOG_PAYMENT_ENV === 'sandbox' ? 'sandbox' : 'live';
}

export function isBogCheckoutAvailable(): boolean {
  const environment = process.env.BOG_PAYMENT_ENV;
  return (environment === undefined || environment === 'live' || environment === 'sandbox') && config() !== null;
}

export function hasPendingBogRegistration(phone: string): boolean {
  return [...db.paymentIntents.values()].some(intent => intent.status === 'PENDING' && intent.providerCheckout?.kind === 'REGISTRATION' && intent.providerCheckout.phone === phone);
}

export function findPendingBogOrder(craftsmanId: string, kind: BogCheckout['kind']): PaymentIntent | undefined {
  return [...db.paymentIntents.values()].find(intent => intent.status === 'PENDING' && intent.providerCheckout?.kind === kind && intent.craftsmanId === craftsmanId);
}

export function registrationProofHash(proof: unknown): string | undefined {
  return typeof proof === 'string' && /^[A-Za-z0-9-]{64,128}$/.test(proof) ? createHash('sha256').update(proof).digest('hex') : undefined;
}

export function checkoutResponse(intent: PaymentIntent) {
  const status = intent.providerCheckout?.needsReview ? 'REVIEW' : intent.status;
  return { id: intent.id, paymentIntentId: intent.id, status, kind: intent.providerCheckout?.kind,
    ...(status === 'PENDING' && intent.providerCheckout?.redirectUrl ? { redirectUrl: intent.providerCheckout.redirectUrl } : {}) };
}

async function serialize<T>(key: string, work: () => Promise<T>): Promise<T> {
  const prior = locks.get(key);
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  locks.set(key, current);
  try { await prior; return await work(); }
  finally { release(); if (locks.get(key) === current) locks.delete(key); }
}

type CheckoutChanges = Parameters<typeof storage.saveBogPayment>[1];

async function persist(intent: PaymentIntent, changes: CheckoutChanges = {}) {
  await storage.saveBogPayment(intent, changes, () => {
    if (changes.registration) {
      const { user, craftsman } = changes.registration;
      if (changes.registration.existingUser) db.craftsmanDrafts.delete(user.id);
      else db.users.set(user.id, user);
      db.craftsmen.set(craftsman.id, craftsman);
    }
    if (changes.listing) {
      db.craftsmanListings.set(changes.listing.craftsmanId, changes.listing);
      const c = db.craftsmen.get(changes.listing.craftsmanId);
      if (c) { c.status = 'ACTIVE'; c.updatedAt = changes.listing.updatedAt; }
    }
    if (changes.membership) db.top15Memberships.set(changes.membership.id, changes.membership);
    if (changes.reservation) db.top15Reservations.set(changes.reservation.id, changes.reservation);
    db.paymentIntents.set(intent.id, intent);
  });
}

async function startStoredBogOrder(intent: PaymentIntent) {
  const checkout = intent.providerCheckout!;
  if (intent.status !== 'PENDING' || intent.bankPaymentId) return checkoutResponse(intent);
  const connection = config(checkout.environment);
  if (!connection) throw new BogCheckoutError(503, 'PAYMENT_PROVIDER_NOT_READY');
  const start = await createBankCheckout({ bank: 'prov-bog', credentials: connection.credentials, bogEnvironment: connection.environment,
    paymentId: intent.id, requestKey: intent.id, amountMinor: intent.amountMinor, ttlMinutes: ORDER_TTL_MINUTES,
    manualCapture: false,
    callbackUrl: `${connection.origin}/api/v1/payments/bog/callback/${connection.environment}`,
    returnUrl: `${connection.origin}/?bog_order=${intent.id}`,
  });
  const pending: PaymentIntent = { ...intent, bankPaymentId: start.bankPaymentId, providerCheckout: { ...checkout, redirectUrl: start.redirectUrl } };
  await persist(pending);
  return checkoutResponse(pending);
}

export async function openBogCheckout(input: {
  kind: BogCheckout['kind']; amountMinor: number; currency: string;
  craftsman?: Craftsman; reservation?: Top15Reservation;
  registration?: BogCheckout['registration']; proofHash?: string; requestKey?: string;
}) {
  const phone = input.registration?.user.phone;
  const owner = input.craftsman?.id || phone;
  if (!owner || !Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.currency !== 'GEL') {
    throw new BogCheckoutError(422, 'PAYMENT_PROVIDER_UNAVAILABLE');
  }
  return serialize(`open:${input.kind}:${owner}`, async () => {
    const scopedKey = input.requestKey ? `bog:${createHash('sha256').update(`${input.kind}:${owner}:${input.requestKey}`).digest('hex')}` : undefined;
    const retry = scopedKey && [...db.paymentIntents.values()].find(intent => intent.idempotencyKey === scopedKey);
    if (retry && retry.status !== 'PENDING') return checkoutResponse(retry);
    let existing = input.kind === 'REGISTRATION'
      ? [...db.paymentIntents.values()].find(intent => intent.status === 'PENDING' && intent.providerCheckout?.kind === 'REGISTRATION' && intent.providerCheckout.phone === phone)
      : findPendingBogOrder(owner, input.kind);
    if (existing && (input.kind === 'REGISTRATION' && existing.providerCheckout?.proofHash !== input.proofHash ||
        input.kind === 'TOP15' && existing.reservationId !== input.reservation?.id)) {
      throw new BogCheckoutError(409, 'BOG_CHECKOUT_PENDING');
    }
    const connection = config(existing?.providerCheckout?.environment);
    if (!connection) throw new BogCheckoutError(503, 'PAYMENT_PROVIDER_NOT_READY');
    if (!existing) {
      const id = randomUUID();
      const now = new Date().toISOString();
      existing = {
        id, reservationId: input.reservation?.id || '', craftsmanId: input.craftsman?.id || null,
        providerId: 'prov-bog', amountMinor: input.amountMinor, currency: input.currency, idempotencyKey: scopedKey || `bog:${id}`,
        status: 'PENDING', createdAt: now, financialTermsVersion: FINANCIAL_TERMS_VERSION,
        financialTermsAcceptedAt: now, productType: input.kind === 'TOP15' ? 'TOP15' : 'LISTING',
        providerCheckout: { kind: input.kind, environment: connection.environment, phone, proofHash: input.proofHash, registration: input.registration },
      };
      const reservation = input.reservation ? { ...input.reservation, expiresAt: Date.now() + CHECKOUT_HOLD_MS } : undefined;
      await persist(existing, { reservation });
    }
    const id = existing.id;
    return serialize(`order:${id}`, () => startStoredBogOrder(db.paymentIntents.get(id)!));
  });
}

export async function reconcileBogPayment(id: string, callbackBankId?: string) {
  return serialize(`order:${id}`, async () => {
    const intent = db.paymentIntents.get(id);
    const checkout = intent?.providerCheckout;
    if (!intent || !checkout) throw new BogCheckoutError(404, 'NOT_FOUND');
    if (callbackBankId && intent.bankPaymentId && callbackBankId !== intent.bankPaymentId) throw new BogCheckoutError(404, 'NOT_FOUND');
    if (intent.status !== 'PENDING') return checkoutResponse(intent);
    const bankId = intent.bankPaymentId || callbackBankId;
    if (!bankId) {
      if (Date.now() - Date.parse(intent.createdAt) < UNLINKED_ORDER_TIMEOUT_MS) return startStoredBogOrder(intent);
      // We persist the bank ID before sharing a redirect. An unlinked order could not be paid from Master Boy.
      const stale: PaymentIntent = { ...intent, status: 'FAILED', providerCheckout: { ...checkout, registration: undefined, phone: undefined } };
      const held = checkout.kind === 'TOP15' ? db.top15Reservations.get(intent.reservationId) : undefined;
      await persist(stale, { reservation: held ? { ...held, status: 'CANCELLED' } : undefined });
      return checkoutResponse(stale);
    }
    const connection = config(checkout.environment, false);
    if (!connection) throw new BogCheckoutError(503, 'PAYMENT_PROVIDER_NOT_READY');
    const state = await getBankPaymentState('prov-bog', connection.credentials, bankId, intent.amountMinor, fetch,
      { environment: checkout.environment, externalOrderId: intent.id });
    if (state === 'PENDING' || state === 'AUTHORIZED') return checkoutResponse(intent);
    const reservation = checkout.kind === 'TOP15' ? db.top15Reservations.get(intent.reservationId) : undefined;
    const changes: CheckoutChanges = {};
    if (reservation) changes.reservation = { ...reservation, status: 'CANCELLED' };
    const settled: PaymentIntent = { ...intent, bankPaymentId: bankId, status: state === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED',
      providerCheckout: { ...checkout, registration: undefined, phone: undefined, redirectUrl: undefined } };
    if (state === 'SUCCEEDED') {
      const now = Date.now();
      const settledAt = new Date(now).toISOString();
      const registration = checkout.registration;
      let c = intent.craftsmanId ? db.craftsmen.get(intent.craftsmanId) : undefined;
      const account = registration && [...db.users.values()].find(user => user.phone === registration.user.phone);
      const accountCanRegister = registration?.existingUser
        ? account?.id === registration.user.id && account?.status === 'ACTIVE' && ![...db.craftsmen.values()].some(profile => profile.userId === account.id && profile.status !== 'DELETED')
        : !account;
      if (checkout.kind === 'REGISTRATION' && registration && accountCanRegister) {
        c = { ...registration.craftsman, status: 'ACTIVE', updatedAt: settledAt,
          financialTermsVersion: intent.financialTermsVersion, financialTermsAcceptedAt: intent.financialTermsAcceptedAt };
        changes.registration = { user: registration.user, craftsman: c, existingUser: registration.existingUser };
        settled.craftsmanId = c.id;
      }
      const listing = c ? db.getCraftsmanListing(c.id) : undefined;
      const eligible = c && !['BLOCKED', 'DELETED', 'PURGED'].includes(c.status) && listing?.status !== 'PURGED' && listing?.status !== 'BLOCKED';
      if (c && eligible && checkout.kind !== 'TOP15') {
        const serviceStart = Math.max(now, listing?.status === 'ACTIVE' && listing.expiresAt ? Date.parse(listing.expiresAt) : now);
        const serviceEnd = serviceStart + 180 * DAY;
        changes.listing = { id: listing?.id || `list-${c.id}`, craftsmanId: c.id, cityId: c.cityId, professionId: c.professionId,
          status: 'ACTIVE', startsAt: serviceStart > now ? listing?.startsAt : settledAt, expiresAt: new Date(serviceEnd).toISOString(),
          graceEndsAt: new Date(serviceEnd + 30 * DAY).toISOString(), lastPaymentId: intent.id, createdAt: listing?.createdAt || settledAt, updatedAt: settledAt };
        settled.serviceStartsAt = new Date(serviceStart).toISOString(); settled.serviceEndsAt = changes.listing.expiresAt;
      } else if (c && eligible && reservation?.status === 'HELD' && listing?.status === 'ACTIVE' && coversTop15Term(listing.expiresAt, now) &&
          c.cityId === reservation.cityId && c.professionId === reservation.professionId && db.getActiveTop15Count(c.cityId, c.professionId) < 15 &&
          !db.getActiveTop15Memberships(c.cityId, c.professionId).some(member => member.craftsmanId === c!.id)) {
        const membership: Top15Membership = { id: `mem-${intent.id}`, craftsmanId: c.id, cityId: c.cityId, professionId: c.professionId,
          cityName: db.cities.find(city => city.id === c.cityId)?.name.ka || '', professionName: db.professions.find(prof => prof.id === c.professionId)?.name.ka || '',
          status: 'ACTIVE', startsAt: settledAt, expiresAt: new Date(now + TOP15_TERM_MS).toISOString() };
        changes.membership = membership;
        changes.reservation = { ...reservation, status: 'PAID' };
        settled.serviceStartsAt = settledAt; settled.serviceEndsAt = membership.expiresAt;
      } else {
        settled.providerCheckout!.needsReview = true;
        changes.reviewCraftsmanId = intent.craftsmanId || registration?.craftsman.id;
      }
    }
    await persist(settled, changes);
    return checkoutResponse(settled);
  });
}

let reconciliationActive = false;
let reconciliationCursor = 0;

export async function reconcilePendingBogOrders(): Promise<void> {
  if (reconciliationActive) return;
  reconciliationActive = true;
  try {
    const pending = [...db.paymentIntents.values()].filter(intent => intent.status === 'PENDING' && intent.providerCheckout &&
      (intent.bankPaymentId || Date.now() - Date.parse(intent.createdAt) >= UNLINKED_ORDER_TIMEOUT_MS));
    if (!pending.length) return;
    const cursor = reconciliationCursor % pending.length;
    const batch = [...pending.slice(cursor), ...pending.slice(0, cursor)].slice(0, 3);
    reconciliationCursor = cursor + batch.length;
    await Promise.allSettled(batch.map(intent => reconcileBogPayment(intent.id)));
  } finally { reconciliationActive = false; }
}
