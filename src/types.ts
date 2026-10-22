export type Language = 'ka' | 'ru' | 'en';
export type Role = 'CRAFTSMAN' | 'ADMIN' | 'SUPER_ADMIN' | 'AI_ADMIN' | 'AD_PARTNER';
export type CraftsmanStatus = 'ACTIVE' | 'UNPAID_DRAFT' | 'EXPIRED' | 'PURGED' | 'BLOCKED' | 'DELETED';
export type ListingStatus = 'UNPAID_DRAFT' | 'ACTIVE' | 'EXPIRED' | 'PURGED' | 'BLOCKED';

export interface Advertisement {
  id: string;
  company_name: string;
  phone_number: string;
  password?: string;
  expires_at: string;
  image_url: string;
  target_url: string;
  is_active: boolean;
  payment_status: 'paid' | 'pending';
  terms_accepted: boolean;
  price_gel?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AdvertisementPublic {
  id: string;
  company_name: string;
  image_url: string;
  target_url: string;
  expires_at: string;
}

export interface CraftsmanListingInfo {
  status: ListingStatus;
  cityId: string;
  professionId: string;
  startsAt?: string | null;
  expiresAt?: string | null;
  secondsRemaining?: number;
  graceEndsAt?: string | null;
  price?: {
    amountMinor: number;
    currency: string;
  };
}

export interface City {
  id: string;
  name: string;
  isActive: boolean;
  lat: number;
  lng: number;
}

export interface Profession {
  id: string;
  name: string;
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

export interface CraftsmanPublic {
  id: string;
  name: string;
  description: string;
  phone?: string | null;
  phoneVisible: boolean;
  workingHours: WorkingHours | null;
  cityId: string;
  cityName: string;
  professionId: string;
  professionName: string;
  status: CraftsmanStatus;
  photos: CraftsmanPhoto[];
  primaryPhotoUrl?: string;
  isTop15?: boolean;
}

export interface User {
  id: string;
  phone: string;
  password?: string;
  roles: Role[];
  status?: 'ACTIVE' | 'BLOCKED' | 'DELETED';
}

export interface Top15Price {
  cityId: string;
  professionId: string;
  amountMinor: number;
  currency: string;
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

export interface AdminTop15Member {
  id: string;
  craftsmanId: string;
  craftsmanName: string;
  cityName: { ka: string; ru: string; en: string };
  professionName: { ka: string; ru: string; en: string };
  startsAt: string;
  expiresAt: string;
}

export interface PaymentProvider {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface PaymentProviderAdmin {
  id: string;
  name: string;
  apiKeyMasked: string;
  apiKey?: string;
  secretKey?: string;
  clientId?: string;
  webhookSecret?: string;
  isActive: boolean;
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
  actorType: 'USER' | 'AI_ADMIN';
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  createdAt: string;
}

export interface Analytics {
  totalCraftsmen: number;
  activeCraftsmen: number;
  activeTop15Slots: number;
  totalRevenueGEL: number;
  totalDisputes: number;
  activeSessions: number;
  configLocked: boolean;
  configLockedUntil: string | null;
}
