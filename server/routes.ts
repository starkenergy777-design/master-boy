import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db, verifyPassword, hashPassword } from './db.js';
import { storage } from './storage.js';
import { generateSupportReply, generatePeriodicReport, testGeminiKey, resetAiClient } from './gemini.js';
import {
  Language,
  Role,
  User,
  Craftsman,
  CraftsmanStatus,
  CraftsmanPhoto,
  ChatMessage,
} from './types.js';

export const apiRouter = Router();

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const MAX_RATE_BUCKETS = 10_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    if (current) rateBuckets.delete(key);
    if (rateBuckets.size >= MAX_RATE_BUCKETS) {
      for (const [bucketKey, bucket] of rateBuckets) {
        if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
      }
      if (rateBuckets.size >= MAX_RATE_BUCKETS) return false;
    }
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function safeUser(user: User) {
  return { id: user.id, phone: user.phone, roles: user.roles, status: user.status, createdAt: user.createdAt };
}

function safeAdminCraftsman(craftsman: Craftsman | undefined) {
  if (!craftsman) return null;
  const { bankAccount: _bankAccount, ...safeCraftsman } = craftsman;
  return safeCraftsman;
}

function safeAdvertisement(ad: any) {
  if (!ad) return ad;
  const { password, ...publicData } = ad;
  return publicData;
}


function validateHttpUrl(value: unknown, field: string, allowEmpty = true): string | null {
  if (value === undefined || value === null || String(value).trim() === '') return allowEmpty ? '' : null;
  const raw = String(value).trim();
  if (raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeProvider(provider: any) {
  if (!provider) return provider;
  const clone = { ...provider };
  for (const field of ['apiKey', 'secretKey', 'webhookSecret']) {
    clone[`${field}Configured`] = typeof clone[field] === 'string' && clone[field].length > 0;
    delete clone[field];
  }
  if (clone.apiKeyConfigured) clone.apiKeyMasked = '********';
  return clone;
}

function isProviderType(value: string): value is 'payment' | 'sms' | 'email' {
  return value === 'payment' || value === 'sms' || value === 'email';
}

function requireRealPaymentIntegration(res: Response): boolean {
  if (process.env.NODE_ENV === 'production') {
    res.status(503).json({
      code: 'PAYMENT_PROVIDER_NOT_READY',
      message: 'Real payment gateway integration is required before production payments can be accepted.',
    });
    return false;
  }
  if (process.env.PAYMENTS_SIMULATION !== 'true') {
    res.status(503).json({
      code: 'PAYMENT_SIMULATION_DISABLED',
      message: 'Payment simulation is disabled.',
    });
    return false;
  }
  return true;
}

// Helper to extract language from Accept-Language header
function getLang(req: Request): Language {
  const header = req.header('Accept-Language')?.toLowerCase() || 'ka';
  if (header.includes('ru')) return 'ru';
  if (header.includes('en')) return 'en';
  return 'ka';
}

// Authentication middleware
interface AuthRequest extends Request {
  user?: User;
  sessionToken?: string;
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  const token = authHeader.replace('Bearer ', '').trim();
  const session = db.sessions.get(token);
  if (session && Date.now() - session.createdAt > SESSION_TTL_MS) {
    db.sessions.delete(token);
    return res.status(401).json({ code: 'SESSION_EXPIRED', message: 'Session expired' });
  }
  if (!session) {
    return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Session expired or invalid' });
  }
  const user = db.users.get(session.userId);
  if (!user) {
    return res.status(401).json({ code: 'USER_NOT_FOUND', message: 'User record not found' });
  }
  if (user.status === 'DELETED') {
    return res.status(401).json({ code: 'USER_DELETED', message: 'Account no longer exists' });
  }
  if (user.status === 'BLOCKED') {
    return res.status(403).json({ code: 'USER_BLOCKED', message: 'Account blocked by administrator' });
  }
  req.user = user;
  req.sessionToken = token;
  next();
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user?.roles.some(r => r === 'ADMIN' || r === 'SUPER_ADMIN')) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Admin access required' });
    }
    next();
  });
}

function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user?.roles.includes('SUPER_ADMIN')) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Super Admin access required' });
    }
    next();
  });
}

function requireCraftsman(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user?.roles.includes('CRAFTSMAN')) {
      return res.status(403).json({ code: 'NOT_A_CRAFTSMAN', message: 'Craftsman account required' });
    }
    next();
  });
}

function requireAdPartner(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user?.roles.includes('AD_PARTNER')) {
      return res.status(403).json({ code: 'NOT_AD_PARTNER', message: 'Advertisement partner account required' });
    }
    next();
  });
}

function canManageAccount(req: AuthRequest, res: Response, target: User, action: 'block' | 'unblock' | 'delete'): boolean {
  if (target.id === req.user?.id) {
    res.status(409).json({ code: 'CANNOT_MANAGE_SELF', message: 'You cannot change your own account status.' });
    return false;
  }

  const isStaff = target.roles.some(role => role === 'ADMIN' || role === 'SUPER_ADMIN');
  const isSuperAdmin = req.user?.roles.includes('SUPER_ADMIN') === true;
  if (isStaff && !isSuperAdmin) {
    res.status(403).json({ code: 'STAFF_ACCOUNT_REQUIRES_SUPER_ADMIN', message: 'Only a super administrator can manage administrator accounts.' });
    return false;
  }

  if (action === 'unblock' && target.status === 'DELETED') {
    res.status(409).json({ code: 'DELETED_ACCOUNT_CANNOT_BE_RESTORED', message: 'Deleted accounts cannot be reactivated.' });
    return false;
  }

  if ((action === 'block' || action === 'delete') && target.roles.includes('SUPER_ADMIN') && target.status === 'ACTIVE') {
    const activeSuperAdmins = Array.from(db.users.values()).filter(user =>
      user.roles.includes('SUPER_ADMIN') && user.status === 'ACTIVE'
    ).length;
    if (activeSuperAdmins <= 1) {
      res.status(409).json({ code: 'LAST_SUPER_ADMIN', message: 'The last active super administrator cannot be blocked or deleted.' });
      return false;
    }
  }

  return true;
}

function revokeUserSessions(userId: string): void {
  for (const [token, session] of db.sessions) {
    if (session.userId === userId) db.sessions.delete(token);
  }
}

// Configuration Lock check middleware (§3.5)
function checkConfigLock(req: Request, res: Response, next: NextFunction) {
  if (db.configLock.locked && db.configLock.lockedUntil) {
    const until = new Date(db.configLock.lockedUntil).getTime();
    if (Date.now() < until) {
      return res.status(423).json({
        code: 'CONFIG_LOCKED',
        message: 'Configuration is locked for 6 months. Changes are prohibited.',
        lockedUntil: db.configLock.lockedUntil,
      });
    } else {
      db.configLock.locked = false;
      db.configLock.lockedUntil = null;
    }
  }
  next();
}

// ==========================================
// 6.1 PUBLIC ENDPOINTS (NO AUTH)
// ==========================================

// GET /health
apiRouter.get('/health', (req, res) => {
  const durableRequired = process.env.NODE_ENV === 'production' && process.env.REQUIRE_DURABLE_STORAGE !== 'false';
  const durableReady = storage.getStatus().databaseConnected;
  if (durableRequired && !durableReady) {
    return res.status(503).json({ status: 'NOT_READY', service: 'MASTER_BOY API Server', version: 'v1.4.0', durableStorage: false });
  }
  res.json({ status: 'UP', service: 'MASTER_BOY API Server', version: 'v1.4.0', durableStorage: durableReady });
});

// GET /cities
apiRouter.get('/cities', (req, res) => {
  const lang = getLang(req);
  const result = db.cities.map(c => ({
    id: c.id,
    name: db.getLocalizedName(c, lang),
    isActive: c.isActive,
    lat: c.lat,
    lng: c.lng,
  }));
  res.json(result);
});

// GET /professions
apiRouter.get('/professions', (req, res) => {
  const lang = getLang(req);
  const result = db.professions.map(p => ({
    id: p.id,
    name: db.getLocalizedName(p, lang),
  }));
  res.json(result);
});

// GET /search?cityId=&professionId=&page=&size=
apiRouter.get('/search', (req, res) => {
  const lang = getLang(req);
  const cityId = req.query.cityId as string;
  const professionId = req.query.professionId as string;
  const page = parseInt(req.query.page as string) || 1;
  const size = Math.min(parseInt(req.query.size as string) || 20, 50);

  db.runListingWorkers();
  let activeCraftsmen = Array.from(db.craftsmen.values()).filter(c => {
    if (c.status !== 'ACTIVE') return false;
    const listing = db.getCraftsmanListing(c.id);
    return listing && listing.status === 'ACTIVE';
  });

  if (cityId) {
    activeCraftsme