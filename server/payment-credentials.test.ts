import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { decryptPaymentCredentials, encryptPaymentCredentials, separatePaymentCredentials } from './payment-credentials.js';

test('payment provider secrets are removed from public config and encrypted with authenticated encryption', () => {
  const key = randomBytes(32).toString('base64');
  const original = [{ id: 'prov-bog', name: 'Bank of Georgia', clientId: 'merchant', secretKey: 'top-secret', isActive: false }];
  const { publicProviders, credentials } = separatePaymentCredentials(original);
  assert.equal(original[0].secretKey, 'top-secret');
  assert.equal('secretKey' in publicProviders[0], false);
  assert.equal('clientId' in publicProviders[0], false);
  const ciphertext = encryptPaymentCredentials(credentials, key);
  assert.doesNotMatch(ciphertext, /top-secret|merchant/);
  assert.deepEqual(decryptPaymentCredentials(ciphertext, key), { 'prov-bog': { clientId: 'merchant', secretKey: 'top-secret' } });
  assert.throws(() => decryptPaymentCredentials(ciphertext, randomBytes(32).toString('base64')));
  assert.throws(() => decryptPaymentCredentials(ciphertext.slice(0, -3) + 'abc', key));
});

test('missing encryption key blocks saving provider secrets', () => {
  assert.throws(() => encryptPaymentCredentials({ 'prov-tbc': { secretKey: 'secret' } }, ''));
});
