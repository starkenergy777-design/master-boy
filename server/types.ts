export type Role = 'CRAFTSMAN' | 'ADMIN' | 'SUPER_ADMIN' | 'AI_ADMIN' | 'AD_PARTNER';
export type ActorType = 'USER' | 'AI_ADMIN';
export type CraftsmanStatus = 'ACTIVE' | 'UNPAID_DRAFT' | 'EXPIRED' | 'PURGED' | 'BLOCKED' | 'DELETED';
export type ListingStatus = 'UNPAID_DRAFT' | 'ACTIVE' | 'EXPIRED' | 'PURGED' | 'BLOCKED';
export type Language = 'ka' | 'ru' | 'en';

export interface Advertisement {
  id: string;
  company_name: string; // Official legal entity/brand name (REQUIRED)
  phone_number: string;
  password?: string;
  expires_at: string; // ISO Timestamp
  image_url: string;
  target_url: string;
  is_active: boolean;
  payment_status: 'paid' | 'pending';
  terms_accepted: boolean;
  price_gel?: number;
  days_duration?: number;
  created_at: string;
  updated_at: string;
}

export interface AdvertisementPublic {
  id: string;
  company_name: string;
  image_url: string;
  target_url: string;
  expires_at: string;
}

export interface LocalizedString {
  ka: string;
  ru: string;
  en: string;
}

export interface City {
  id: string;
  name: LocalizedString;
  isActive: boolean;
  lat: number;
  lng: number;
}

export interface Profession {
  id: string;
  name: LocalizedString;
}

export interface WorkingHours {
  monday?: string | null;
  tuesday?: string | null;
  wednesday?: string | null;
  thursday?: string | null;
  friday?: string | null;
  saturday?: string | null;
  sunday?: string | null;
}

export interface CraftsmanPhoto {
  id: string;
  craftsmanId: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CraftsmanListing {
  id: string;
  craftsmanId: string;
  cityId: string;
  professionId: string;
  status: ListingStatus;
  startsAt?: string | null;
  expiresAt?: string | null; // starts_at + 180 days
  graceEndsAt?: string | null; // expires_at + 30 days
  lastPaymentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListingPrice {
  amountMinor: number;
  currency: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ListingPurgeLog {
  id: string;
  craftsmanId: string;
  cityId: string;
  professionId: string;
  purgedAt: string;
  reason: string;
}

export interface Craftsman {
  id: string;
  userId: string;
  name: string;
  description: string;
  phone: string;
  phoneVisible: boolean;
  latitude: number | null;
  longitude: number | null;
  workingHours: WorkingHours | null;
  status: CraftsmanStatus;
  cityId: string;
  professionId: string;
  bankAccount?: string | null;
  createdAt: string;
  updatedAt: string;
  photos: CraftsmanPhoto[];
}

export interface CraftsmanPublic {
  id: string;
  name: string;
  fullName?: string;
  description: string;
  phone?: string | null;
  phoneVisible: boolean;
  workingHours: WorkingHours | null;
  cityId: string;
  cityName: string;
  professionId: string;
  professionName: string;
  bankAccount?: string | null;
  status: CraftsmanStatus;
  photos: CraftsmanPhoto[];
  primaryPhotoUrl?: string;
  isTop15?: boolean;
}

export interface CraftsmanDraft {
  step: number;
  data: Record<string, any>;
  updatedAt: string;
}

export interface User {
  id: string;
  phone: string;
  password?: string;
  roles: Role[];
  status: 'ACTIVE' | 'BLOCKED' | 'DELETED';
  createdAt: string;
}

export interface Top15Price {
  cityId: string;
  professionId: string;
  amountMinor: number;
  currency: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Top15Reservation {
  id: string;
  craftsmanId: string;
  cityId: string;
  professionId: string;
  amountMinor: number;
  currency: string;
  expiresAt: number; // Unix timestamp ms
  status: 'HELD' | 'PAID' | 'EXPIRED';
}

export interface Top15Membership {
  id: string;
  craftsmanId: string;
  cityId: string;
  cityName: string;
  professionId: string;
  professionName: string;
  startsAt: string;
  expiresAt: string;
  status: 'ACTIVE' | 'EXPIRED';
}

export interface PaymentProvider {
  id: string;
  name: string;
  code: 'bog' | 'stripe' | 'flitt';
  icon: string;
  isActive: boolean;
}

export interface PaymentIntent {
  id: string;
  reservationId: string;
  craftsmanId: string;
  providerId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING';
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  craftsmanId: string;
  sender: 'CRAFTSMAN' | 'AI_ADMIN';
  body: string;
  flaggedForHuman: boolean;
  createdAt: string;
}

export interface AiReport {
  id: string;
  type: 'ACCOUNTING' | 'RECOMMENDATIONS' | 'HEALTH' | 'DISPUTE';
  craftsmanId?: string | null;
  craftsmanName?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  content: Record<string, any>;
  createdAt: string;
}

export interface AdminAuditLog {
  id: string;
  actorType: ActorType;
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  createdAt: string;
}

export interface ProviderConfig {
  payment: {
    id: string;
    name: string;
    apiKeyMasked: string;
    apiKey?: string;
    secretKey?: string;
    clientId?: string;
    webhookSecret?: string;
    isActive: boolean;
  }[];
  sms: { id: string; provider: string; senderId: string; isActive: boolean }[];
  email: { id: string; provider: string; host: string; isActive: boolean }[];
  ai: {
    configured: boolean;
    verifiedAt: string | null;
    lastCallOk: boolean;
    provider: string;
  };
}

export interface RecipientAccount {
  iban: string;
  bankName: string;
  beneficiary: string;
  taxNumber: string;
  updatedAt: string;
}

export interface ConfigLock {
  locked: boolean;
  lockedUntil: string | null;
  lockedAt: string | null;
  unlockCredentialHash?: string;
}
