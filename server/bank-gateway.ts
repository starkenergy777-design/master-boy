import { randomUUID } from 'node:crypto';

export type BankId = 'prov-bog' | 'prov-tbc';
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
}
export interface CheckoutResponse { bankPaymentId: string; redirectUrl: string }

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
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Bank API request failed with HTTP ${response.status}.`);
  const body = await response.json();
  if (!body || typeof body !== 'object') throw new Error('Bank API returned invalid JSON.');
  return body;
}

function redirectUrl(value: unknown, host: string): string {
  if (typeof value !== 'string') throw new Error('Bank API did not return a payment redirect.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password) {
    throw new Error('Bank API returned an unexpected payment redirect.');
  }
  return url.toString();
}

async function bogToken(credentials: BankCredentials, fetcher: typeof fetch): Promise<string> {
  const body = await bankJson(fetcher, 'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token', {
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

export async function verifyBankCredentials(bank: BankId, credentials: BankCredentials, fetcher: typeof fetch = fetch): Promise<void> {
  if (bank === 'prov-bog') await bogToken(credentials, fetcher);
  else if (bank === 'prov-tbc' && credentials.apiKey) await tbcToken(credentials, fetcher);
  else throw new Error('Unsupported or incomplete bank credentials.');
}

export async function createBankCheckout(input: CheckoutRequest, fetcher: typeof fetch = fetch): Promise<CheckoutResponse> {
  validateRequest(input);
  const total = input.amountMinor / 100;
  if (input.bank === 'prov-bog') {
    const token = await bogToken(input.credentials, fetcher);
    const body = await bankJson(fetcher, 'https://api.bog.ge/payments/v1/ecommerce/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': input.requestKey, 'Accept-Language': 'ka' },
      body: JSON.stringify({
        callback_url: input.callbackUrl,
        external_order_id: input.paymentId,
        capture: input.manualCapture ? 'manual' : 'automatic',
        ...(input.manualCapture ? { payment_method: ['card'] } : {}),
        purchase_units: { currency: 'GEL', total_amount: total, basket: [{ product_id: input.paymentId, quantity: 1, unit_price: total }] },
        redirect_urls: { success: input.returnUrl, fail: input.returnUrl },
      }),
    });
    if (typeof body.id !== 'string' || !body.id) throw new Error('BOG did not return an order identifier.');
    return { bankPaymentId: body.id, redirectUrl: redirectUrl(body._links?.redirect?.href, 'payment.bog.ge') };
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
): Promise<BankPaymentState> {
  if (!bankPaymentId || !Number.isSafeInteger(expectedAmountMinor) || expectedAmountMinor <= 0) throw new Error('Invalid payment status lookup.');
  if (bank === 'prov-bog') {
    const token = await bogToken(credentials, fetcher);
    const body = await bankJson(fetcher, `https://api.bog.ge/payments/v1/receipt/${encodeURIComponent(bankPaymentId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (body.order_id !== bankPaymentId || body.purchase_units?.currency_code !== 'GEL' ||
        Math.round(Number(body.purchase_units?.request_amount) * 100) !== expectedAmountMinor) {
      throw new Error('BOG payment details do not match the local order.');
    }
    const status = body.order_status?.key;
    if (status === 'completed' || status === 'partial_completed') return 'SUCCEEDED';
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

export function newBankRequestKey(): string { return randomUUID(); }
