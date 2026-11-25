import { randomUUID, verify } from 'node:crypto';

export type BankId = 'prov-bog' | 'prov-tbc';
export type BogEnvironment = 'live' | 'sandbox';
export type BankPaymentState = 'PENDING' | 'AUTHORIZED' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
export interface BankCredentials { clientId: string; secretKey: string; apiKey?: string }
export interface CheckoutRequest {
  bank: BankId;
  credentials: BankCredentials;
  paymentId: string;
  amountMinor: number;
  callbackUrl: string;
  returnUrl: string;
  manualCapture: boolean;
  requestKey: string;
  bogEnvironment?: BogEnvironment;
  ttlMinutes?: number;
}
export interface CheckoutResponse { bankPaymentId: string; redirectUrl: string }

// BOG's published callback signing keys. The merchant's numeric Public Key is its OAuth client ID.
// https://api.bog.ge/docs/payments/standard-process/callback
// https://api.bog.ge/docs/en/sandbox/payments/standard-process/callback
const bogSigningKeys: Record<BogEnvironment, string> = {
  live: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu4RUyAw3+CdkS3ZNILQh
zHI9Hemo+vKB9U2BSabppkKjzjjkf+0Sm76hSMiu/HFtYhqWOESryoCDJoqffY0Q
1VNt25aTxbj068QNUtnxQ7KQVLA+pG0smf+EBWlS1vBEAFbIas9d8c9b9sSEkTrr
TYQ90WIM8bGB6S/KLVoT1a7SnzabjoLc5Qf/SLDG5fu8dH8zckyeYKdRKSBJKvhx
tcBuHV4f7qsynQT+f2UYbESX/TLHwT5qFWZDHZ0YUOUIvb8n7JujVSGZO9/+ll/g
4ZIWhC1MlJgPObDwRkRd8NFOopgxMcMsDIZIoLbWKhHVq67hdbwpAq9K9WMmEhPn
PwIDAQAB
-----END PUBLIC KEY-----`,
  sandbox: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqczfAuhtxw2iF68kS0Hy
bGSv0ZlDAjsXh6VC8avDl3Vxa9qCn6Pzl37Tl2Z21WodiISLeXdhCtOMTeLNUBeb
CYD31y2/MwnhLYqlCk2bOh29fyPc1iT5Eu/k/1IaNRrK9/UVZaTkhOMeEm+aL4y8
5XsE4UjqftEmwrAdbO2G4cCpuoMC9ZXG9gAdr2BFN6i2Vt9eCen5Poj7E1ik7s8T
GyzploVV0NflhwBGeWnvQANUQGr87gsP5k2JG1z5EwnMybJQ7i3XT726rJMaV6QW
sY5hP72Mtv1I1zL2d9FXm9FWOzbpcXCyxuEBXvqqOHzogri8C7KRRYKyk97Ri7D6
8wIDAQAB
-----END PUBLIC KEY-----`,
};

const bogHosts = {
  live: { oauth: 'oauth2.bog.ge', api: 'api.bog.ge', checkout: 'payment.bog.ge' },
  sandbox: { oauth: 'oauth2-sandbox.bog.ge', api: 'api-sandbox.bog.ge', checkout: 'payment-sandbox.bog.ge' },
} as const;

export function verifyBogCallback(
  rawBody: Buffer,
  signature: string | undefined,
  environment: BogEnvironment,
  signingKey = bogSigningKeys[environment],
): { bankPaymentId: string; externalOrderId: string } | null {
  if (!signature || signature.length > 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return null;
  if (!rawBody.length || rawBody.length > 128 * 1024) return null;
  try {
    if (!verify('RSA-SHA256', rawBody, signingKey, Buffer.from(signature, 'base64'))) return null;
    const payload = JSON.parse(rawBody.toString('utf8'));
    const bankPaymentId = payload?.body?.order_id;
    const externalOrderId = payload?.body?.external_order_id;
    if (payload?.event !== 'order_payment' ||
        typeof bankPaymentId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(bankPaymentId) ||
        typeof externalOrderId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(externalOrderId)) return null;
    return { bankPaymentId, externalOrderId };
  } catch {
    return null;
  }
}

export class BankApiError extends Error {
  constructor(readonly status: number, readonly operation = 'UNKNOWN', readonly bankCode?: string) {
    super(`Bank API request failed with HTTP ${status}.`);
  }
}

export class BogProcessedAmountMismatch extends Error {
  constructor(readonly processedAmountMinor: number) {
    super('BOG did not confirm the full expected payment amount.');
  }
}

function validateRequest(input: CheckoutRequest): void {
  if (!['prov-bog', 'prov-tbc'].includes(input.bank) ||
      !input.credentials.clientId || !input.credentials.secretKey ||
      (input.bank === 'prov-tbc' && !input.credentials.apiKey) ||
      !Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestKey)) {
    throw new Error('Invalid bank checkout request.');
  }
  for (const url of [input.callbackUrl, input.returnUrl]) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Bank callback and return URLs must use HTTPS.');
  }
}

async function bankJson(fetcher: typeof fetch, url: string, init: RequestInit): Promise<any> {
  const response = await fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    const pathname = new URL(url).pathname;
    const operation = pathname.endsWith('/token') || pathname.endsWith('/access-token')
      ? 'AUTHENTICATION'
      : pathname.endsWith('/orders') || pathname.endsWith('/payments') ? 'CREATE_ORDER' : 'PAYMENT_STATUS';
    const body = await response.json().catch(() => null);
    const candidate = body?.error_code ?? body?.code ?? body?.error;
    const bankCode = /^(?:\d{1,6}|invalid_client|unauthorized_client|invalid_request|invalid_grant|unsupported_grant_type)$/.test(String(candidate))
      ? String(candidate) : undefined;
    throw new BankApiError(response.status, operation, bankCode);
  }
  const body = await response.json();
  if (!body || typeof body !== 'object') throw new Error('Bank API returned invalid JSON.');
  return body;
}

function redirectUrl(value: unknown, host: string): string {
  if (typeof value !== 'string') throw new Error('Bank API did not return a payment redirect.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password) {
    throw new Error('Bank API returned an unexpected payment redirect.');
  }
  return url.toString();
}

async function bogToken(credentials: BankCredentials, fetcher: typeof fetch, environment: BogEnvironment = 'live'): Promise<string> {
  const host = bogHosts[environment].oauth;
  const body = await bankJson(fetcher, `https://${host}/auth/realms/bog/protocol/openid-connect/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.secretKey}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (typeof body.access_token !== 'string' || !body.access_token) throw new Error('BOG did not return an access token.');
  return body.access_token;
}

async function tbcToken(credentials: BankCredentials, fetcher: typeof fetch): Promise<string> {
  const body = await bankJson(fetcher, 'https://api.tbcbank.ge/v1/tpay/access-token', {
    method: 'POST',
    headers: { apikey: credentials.apiKey || '', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.secretKey }),
  });
  if (typeof body.access_token !== 'string' || !body.access_token) throw new Error('TBC did not return an access token.');
  return body.access_token;
}

export async function verifyBogCredentials(credentials: BankCredentials, environment: BogEnvironment, fetcher: typeof fetch = fetch): Promise<void> {
  await bogToken(credentials, fetcher, environment);
}

export async function createBankCheckout(input: CheckoutRequest, fetcher: typeof fetch = fetch): Promise<CheckoutResponse> {
  validateRequest(input);
  const total = input.amountMinor / 100;
  if (input.bank === 'prov-bog') {
    const environment = input.bogEnvironment ?? 'live';
    const hosts = bogHosts[environment];
    const token = await bogToken(input.credentials, fetcher, environment);
    const body = await bankJson(fetcher, `https://${hosts.api}/payments/v1/ecommerce/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': input.requestKey, 'Accept-Language': 'ka' },
      body: JSON.stringify({
        callback_url: input.callbackUrl,
        external_order_id: input.paymentId,
        capture: input.manualCapture ? 'manual' : 'automatic',
        ...(input.ttlMinutes === undefined ? {} : { ttl: input.ttlMinutes }),
        ...(input.manualCapture ? { payment_method: ['card'] } : {}),
        purchase_units: { currency: 'GEL', total_amount: total, basket: [{ product_id: input.paymentId, quantity: 1, unit_price: total }] },
        redirect_urls: { success: input.returnUrl, fail: input.returnUrl },
      }),
    });
    if (typeof body.id !== 'string' || !body.id) throw new Error('BOG did not return an order identifier.');
    return { bankPaymentId: body.id, redirectUrl: redirectUrl(body._links?.redirect?.href, hosts.checkout) };
  }
  const token = await tbcToken(input.credentials, fetcher);
  const body = await bankJson(fetcher, 'https://api.tbcbank.ge/v1/tpay/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: input.credentials.apiKey || '', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: { currency: 'GEL', total },
      returnurl: input.returnUrl,
      callbackUrl: input.callbackUrl,
      merchantPaymentId: input.paymentId,
      preAuth: input.manualCapture,
      expirationMinutes: 12,
      language: 'KA',
    }),
  });
  const link = Array.isArray(body.links) ? body.links.find((item: any) => item?.rel === 'approval_url' && item?.method === 'REDIRECT') : null;
  if (typeof body.payId !== 'string' || !body.payId) throw new Error('TBC did not return a payment identifier.');
  return { bankPaymentId: body.payId, redirectUrl: redirectUrl(link?.uri, 'tpay.tbcbank.ge') };
}

export async function getBankPaymentState(
  bank: BankId, credentials: BankCredentials, bankPaymentId: string, expectedAmountMinor: number,
  fetcher: typeof fetch = fetch,
  bogOptions?: { environment: BogEnvironment; externalOrderId: string },
): Promise<BankPaymentState> {
  if (!bankPaymentId || !Number.isSafeInteger(expectedAmountMinor) || expectedAmountMinor <= 0) throw new Error('Invalid payment status lookup.');
  if (bank === 'prov-bog') {
    const environment = bogOptions?.environment ?? 'live';
    const token = await bogToken(credentials, fetcher, environment);
    const body = await bankJson(fetcher, `https://${bogHosts[environment].api}/payments/v1/receipt/${encodeURIComponent(bankPaymentId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (body.order_id !== bankPaymentId || (bogOptions && body.external_order_id !== bogOptions.externalOrderId) || body.purchase_units?.currency_code !== 'GEL' ||
        bankAmountMinor(body.purchase_units?.request_amount) !== expectedAmountMinor) {
      throw new Error('BOG payment details do not match the local order.');
    }
    const status = body.order_status?.key;
    if (status === 'completed' || status === 'partial_completed') {
      const processedAmount = bankAmountMinor(body.purchase_units?.transfer_amount);
      if (processedAmount !== null && processedAmount > 0 && processedAmount !== expectedAmountMinor) {
        throw new BogProcessedAmountMismatch(processedAmount);
      }
      if (processedAmount !== expectedAmountMinor) {
        throw new Error('BOG did not confirm the full expected payment amount.');
      }
      return 'SUCCEEDED';
    }
    if (status === 'blocked') return 'AUTHORIZED';
    if (status === 'rejected') return 'FAILED';
    if (status === 'refunded' || status === 'refunded_partially') return 'REFUNDED';
    return 'PENDING';
  }
  if (bank !== 'prov-tbc' || !credentials.apiKey) throw new Error('Unsupported or incomplete bank credentials.');
  const token = await tbcToken(credentials, fetcher);
  const body = await bankJson(fetcher, `https://api.tbcbank.ge/v1/tpay/payments/${encodeURIComponent(bankPaymentId)}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: credentials.apiKey },
  });
  if (body.payId !== bankPaymentId || body.currency !== 'GEL' || Math.round(Number(body.amount) * 100) !== expectedAmountMinor) {
    throw new Error('TBC payment details do not match the local order.');
  }
  if (body.status === 'Succeeded') return 'SUCCEEDED';
  if (body.status === 'WaitingConfirm') return 'AUTHORIZED';
  if (body.status === 'Failed' || body.status === 'Expired') return 'FAILED';
  if (body.status === 'Returned' || body.status === 'PartialReturned') return 'REFUNDED';
  return 'PENDING';
}

function bankAmountMinor(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [units, fraction = ''] = value.split('.');
  const minor = Number(units) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function newBankRequestKey(): string { return randomUUID(); }
