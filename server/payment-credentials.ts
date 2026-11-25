import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const FIELDS = ['apiKey', 'secretKey', 'clientId', 'webhookSecret'] as const;
type CredentialField = (typeof FIELDS)[number];
type Provider = { id: string; [key: string]: unknown };

export class PaymentCredentialKeyError extends Error {
  constructor() { super('PAYMENT_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte base64 secret.'); }
}

function keyBytes(encoded: string | undefined): Buffer {
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw new PaymentCredentialKeyError();
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw new PaymentCredentialKeyError();
  }
  return key;
}

export function separatePaymentCredentials(providers: Provider[]): {
  publicProviders: Provider[];
  credentials: Record<string, Partial<Record<CredentialField, string>>>;
} {
  const credentials: Record<string, Partial<Record<CredentialField, string>>> = {};
  const publicProviders = providers.map((provider) => {
    const safe: Provider = { ...provider };
    const secret: Partial<Record<CredentialField, string>> = {};
    for (const field of FIELDS) {
      if (typeof safe[field] === 'string' && safe[field]) secret[field] = safe[field] as string;
      delete safe[field];
    }
    if (Object.keys(secret).length) credentials[provider.id] = secret;
    return safe;
  });
  return { publicProviders, credentials };
}

export function encryptPaymentCredentials(credentials: Record<string, unknown>, encodedKey: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(encodedKey), nonce);
  const body = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}

export function decryptPaymentCredentials(value: string, encodedKey: string): Record<string, Partial<Record<CredentialField, string>>> {
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Unsupported payment credential envelope.');
  const nonce = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  if (nonce.length !== 12 || tag.length !== 16) throw new Error('Invalid payment credential envelope.');
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(encodedKey), nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]);
  const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid payment credentials.');
  const result: Record<string, Partial<Record<CredentialField, string>>> = {};
  for (const [providerId, fields] of Object.entries(parsed)) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('Invalid payment credentials.');
    result[providerId] = {};
    for (const field of FIELDS) {
      const candidate = (fields as Record<string, unknown>)[field];
      if (candidate !== undefined && typeof candidate !== 'string') throw new Error('Invalid payment credentials.');
      if (candidate) result[providerId][field] = candidate;
    }
  }
  return result;
}
