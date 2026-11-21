import assert from 'node:assert/strict';
import test from 'node:test';
import { createBankCheckout, getBankPaymentState, newBankRequestKey } from './bank-gateway.js';

function replies(values: unknown[]): { fetcher: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: string | URL | Request, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const value = values.shift();
    return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { fetcher, calls };
}

const base = {
  credentials: { clientId: 'merchant', secretKey: 'secret', apiKey: 'developer-key' },
  paymentId: 'pi-test', amountMinor: 1250,
  callbackUrl: 'https://master-boy.onrender.com/api/v1/banks/callback',
  returnUrl: 'https://master-boy.onrender.com/payment-return',
  manualCapture: true, requestKey: newBankRequestKey(),
};

test('BOG checkout starts manual capture only after the local arbitration and uses bank redirect', async () => {
  const { fetcher, calls } = replies([
    { access_token: 'bog-token' },
    { id: 'bank-order', _links: { redirect: { href: 'https://payment.bog.ge/?order_id=bank-order' } } },
  ]);
  const result = await createBankCheckout({ ...base, bank: 'prov-bog' }, fetcher);
  assert.equal(result.bankPaymentId, 'bank-order');
  assert.equal(calls[0].url, 'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token');
  assert.equal(calls[1].url, 'https://api.bog.ge/payments/v1/ecommerce/orders');
  const body = JSON.parse(String(calls[1].init.body));
  assert.equal(body.capture, 'manual');
  assert.equal(body.purchase_units.total_amount, 12.5);
  assert.deepEqual(body.payment_method, ['card']);
});

test('TBC checkout requires three credentials and returns bank hosted page', async () => {
  const { fetcher, calls } = replies([
    { access_token: 'tbc-token' },
    { payId: 'tbc-payment', links: [{ rel: 'approval_url', method: 'REDIRECT', uri: 'https://tpay.tbcbank.ge/checkout/test' }] },
  ]);
  const result = await createBankCheckout({ ...base, bank: 'prov-tbc' }, fetcher);
  assert.equal(result.bankPaymentId, 'tbc-payment');
  assert.equal(calls[0].url, 'https://api.tbcbank.ge/v1/tpay/access-token');
  const body = JSON.parse(String(calls[1].init.body));
  assert.equal(body.preAuth, true);
  assert.equal(body.amount.total, 12.5);
  await assert.rejects(() => createBankCheckout({ ...base, bank: 'prov-tbc', credentials: { clientId: 'x', secretKey: 'y' } }, fetcher));
});

test('payment details are checked against bank order, amount and currency before success', async () => {
  const good = replies([{ access_token: 'token' }, { payId: 'bank-id', status: 'Succeeded', currency: 'GEL', amount: 12.5 }]);
  assert.equal(await getBankPaymentState('prov-tbc', base.credentials, 'bank-id', 1250, good.fetcher), 'SUCCEEDED');
  const wrong = replies([{ access_token: 'token' }, { payId: 'bank-id', status: 'Succeeded', currency: 'GEL', amount: 13 }]);
  await assert.rejects(() => getBankPaymentState('prov-tbc', base.credentials, 'bank-id', 1250, wrong.fetcher));
  const pending = replies([{ access_token: 'token' }, { order_id: 'bank-id', order_status: { key: 'blocked' }, purchase_units: { currency_code: 'GEL', request_amount: '12.5' } }]);
  assert.equal(await getBankPaymentState('prov-bog', base.credentials, 'bank-id', 1250, pending.fetcher), 'AUTHORIZED');
});

test('unexpected redirect host is rejected', async () => {
  const { fetcher } = replies([{ access_token: 'token' }, { id: 'bank-order', _links: { redirect: { href: 'https://example.com/steal' } } }]);
  await assert.rejects(() => createBankCheckout({ ...base, bank: 'prov-bog' }, fetcher));
});
