// Preview a Drive sharing link through the same public image endpoint used by
// the server. The server still validates the link and checks public access.
export function photoPreviewUrl(input: string): string {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' || !['drive.google.com', 'www.drive.google.com'].includes(url.hostname)) return input;
    const match = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,})(?:\/|$)/);
    const id = match?.[1] ?? (['/open', '/uc'].includes(url.pathname) ? url.searchParams.get('id') : null);
    return id && /^[A-Za-z0-9_-]{10,}$/.test(id)
      ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1000`
      : input;
  } catch {
    return input;
  }
}
