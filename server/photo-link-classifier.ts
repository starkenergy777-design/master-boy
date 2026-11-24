import { isIP } from 'node:net';

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
  // DNS treats a trailing dot as the same host; reject local aliases as well.
  const normalizedHost = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
  // Block obvious loopback and local-network destinations. This is only
  // preliminary validation; a downloader must also resolve DNS and validate
  // every resolved address and redirect target against private IP ranges.
  const ipLiteral = normalizedHost.startsWith('[') && normalizedHost.endsWith(']') ? normalizedHost.slice(1, -1) : normalizedHost;
  const blockedHost = isIP(ipLiteral) !== 0 || normalizedHost === 'localhost' || normalizedHost.endsWith('.localhost') ||
    normalizedHost.endsWith('.local') || normalizedHost.endsWith('.internal') ||
    hostname === '0.0.0.0' || hostname === '[::1]' ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname) ||
    /^10(?:\.\d{1,3}){3}$/.test(hostname) ||
    /^192\.168(?:\.\d{1,3}){2}$/.test(hostname) ||
    /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(hostname) ||
    /^169\.254(?:\.\d{1,3}){2}$/.test(hostname);
  if (blockedHost) return { kind: 'invalid', reason: 'INVALID_URL' };
  const driveHosts = new Set(['drive.google.com', 'www.drive.google.com']);
  if (driveHosts.has(hostname)) {
    const match = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
    const id = match?.[1] ?? (['/open', '/uc', '/thumbnail'].includes(url.pathname) ? url.searchParams.get('id') : null);
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

// A Drive sharing page is HTML. The thumbnail endpoint serves the public
// image itself and keeps the original file in the owner's Drive account.
export function photoDisplayUrl(link: PhotoLink): string | null {
  if (link.kind === 'google_drive') {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(link.fileId)}&sz=w1000`;
  }
  if (link.kind !== 'direct_https') return null;
  const url = new URL(link.url);
  const imagePath = /\.(?:jpe?g|png|webp|gif|avif)$/i.test(url.pathname);
  const imageHost = url.hostname === 'images.unsplash.com' || url.hostname === 'lh3.googleusercontent.com' ||
    url.hostname === 'res.cloudinary.com' || url.hostname.endsWith('.fbcdn.net');
  return imagePath || imageHost ? link.url : null;
}

// Only the fixed Google thumbnail endpoint is fetched by the server. Never
// follow an arbitrary user-supplied URL or an unverified redirect.
export async function isPublicDriveImage(fileId: string): Promise<boolean> {
  let url = photoDisplayUrl({ kind: 'google_drive', fileId })!;
  try {
    // Some Google Drive edges answer HEAD with application/binary (or reject
    // HEAD altogether) even though the image is public. Try HEAD first, then
    // a one-byte GET fallback, while still following only Google redirects.
    for (const method of ['HEAD', 'GET'] as const) {
      let candidateUrl = url;
      for (let redirect = 0; redirect < 3; redirect += 1) {
        const response = await fetch(candidateUrl, {
          method,
          ...(method === 'GET' ? { headers: { Range: 'bytes=0-0' } } : {}),
          redirect: 'manual',
          signal: AbortSignal.timeout(8000),
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) break;
          const next = new URL(location, candidateUrl);
          if (next.protocol !== 'https:' || !['drive.google.com', 'lh3.googleusercontent.com'].includes(next.hostname)) break;
          candidateUrl = next.toString();
          continue;
        }
        const contentType = response.headers.get('content-type') || '';
        if (response.ok && /^image\/(?:jpeg|png|webp|gif|avif)(?:;|$)/i.test(contentType)) return true;
        response.body?.cancel?.();
        break;
      }
    }
  } catch {
    // Private, missing, or temporarily unreachable files must not become a
    // broken public profile image.
  }
  return false;
}
