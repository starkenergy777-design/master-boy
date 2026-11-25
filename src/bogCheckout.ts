const regProofKey = 'mb_bog_registration_proof';
const paymentKey = 'mb_bog_last_order';

export function getBogRegistrationProof() {
  let proof = localStorage.getItem(regProofKey);
  if (!proof) {
    proof = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    localStorage.setItem(regProofKey, proof);
  }
  return proof;
}

export function savedBogRegistrationProof() { return localStorage.getItem(regProofKey) || undefined; }

export function currentBogOrder(): string | null {
  const id = new URLSearchParams(window.location.search).get('bog_order') || localStorage.getItem(paymentKey);
  return id && /^[a-f0-9-]{36}$/.test(id) ? id : null;
}

export function clearBogOrder(id: string) {
  if (localStorage.getItem(paymentKey) === id) localStorage.removeItem(paymentKey);
}

export function redirectToBog(order: { id?: string; redirectUrl?: string }): boolean {
  if (!order.redirectUrl) return false;
  const url = new URL(order.redirectUrl);
  if (!order.id || !/^[a-f0-9-]{36}$/.test(order.id) || url.protocol !== 'https:' || url.port || url.username || url.password ||
      !['payment.bog.ge', 'payment-sandbox.bog.ge'].includes(url.hostname)) throw new Error('Invalid bank checkout redirect.');
  localStorage.setItem(paymentKey, order.id);
  window.location.assign(url.toString());
  return true;
}
