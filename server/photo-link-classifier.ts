/**
 * Classifies craftsman photo links without downloading remote content.
 * This module is deliberately side-effect free. It does not grant access to
 * private Facebook/Google Drive media and must not be used as an SSRF guard
 * for arbitrary fetches; any future downloader needs its own DNS, redirect,
 * MIME, byte-limit and timeout protections.
 */
export type PhotoLink =
  | { kind: 'google_drive'; fileId: string }
  | { kind: 'facebook_page'; url: string }
  | { kind: 'direct_https'; url: string }
  | { kind: 'invalid'; reason: 'INVALID_URL' | 'UNSUPPORTED_PROTOCOL' | 'UNSUPPORTED_DRIVE_LINK' | 'CREDENTIALS_NOT_ALLOWED' };

export function classifyPhotoLink(input: string): PhotoLink {
  if (typeof input !== 'string' || input.length > 2048 || !input.trim()) {
    return { kind: 'invalid', reason: 'INVALID_URL' };
  }
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { kind: 'invalid', reason: 'INVALID_URL' };
  }
  if (url.protocol !== 'https:') {
    return { kind: 'invalid', reason: 'UNSUPPORTED_PROTOCOL' };
  }
  // Reject credentials and non-standard ports before any future download integration.
  if (url.username || url.password) {
    return { kind: 'invalid', reason: 'CREDENTIALS_NOT_ALLOWED' };
  }
  if (url.port && url.port !== '443') {
    return { kind: 'invalid', reason: 'UNSUPPORTED_PROTOCOL' };
  }
  const hostname = url.hostname.toLowerCase();
  // Block obvious loopback and local-network destinations. This is only
  // preliminary validation; a downloader must also resolve DNS and validate
  // every resolved address and redirect target against private IP ranges.
  const blockedHost = hostname === 'localhost' || hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') || hostname.endsWith('.internal') ||
    hostname === '0.0.0.0' || hostname === '[::1]' ||
    /^127(?:\.\\d{1,3}){3}$/.test(hostname) ||
    /^10(?:\.\\d{1,3}){3}$/.test(hostname) ||
    /^192\.168(?:\.\\d{1,3}){2}$/.test(hostname) ||
    /^172\.(?:1[6-9]|2\\d|3[01])(?:\.\\d{1,3}){2}$/.test(hostname) ||
    /^169\.254(?:\.\\d{1,3}){2}$/.test(hostname);
  if (blockedHost) return { kind: 'invalid', reason: 'INVALID_URL' };
  const driveHosts = new Set(['drive.google.com', 'www.drive.google.com']);
  if (driveHosts.has(hostname)) {
    const match = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
    const id = match?.[1] ?? (['/open', '/uc'].includes(url.pathname) ? url.searchParams.get('id') : null);
    return id && /^[A-Za-z0-9_-]{10,}$/.test(id)
      ? { kind: 'google_drive', fileId: id }
      : { kind: 'invalid', reason: 'UNSUPPORTED_DRIVE_LINK' };
  }
  const facebookHosts = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'mbasic.facebook.com', 'fb.com', 'www.fb.com']);
  if (facebookHosts.has(hostname)) {
    return { kind: 'facebook_page', url: url.toString() };
  }
  return { kind: 'direct_https', url: url.toString() };
}
