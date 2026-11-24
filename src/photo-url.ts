// Preview a Drive sharing link through the same public image endpoint used by
// the server. The server still validates the link and checks public access.
export function photoPreviewUrl(input: string): string {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' || !['drive.google.com', 'www.drive.google.com'].includes(url.hostname)) return input;
    // Drive shares several URL shapes from web and Android: /file/d/ID,
    // /open?id=ID, /uc?id=ID and /thumbnail?id=ID. Keep extraction tolerant
    // of extra path segments/query parameters while retaining a strict ID.
    const pathMatch = url.pathname.match(/(?:^|\/)d\/([A-Za-z0-9_-]{10,})(?:\/|$)/) ||
      url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,})(?:\/|$)/);
    const id = pathMatch?.[1] ?? url.searchParams.get('id');
    return id && /^[A-Za-z0-9_-]{10,}$/.test(id)
      ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1000`
      : input;
  } catch {
    return input;
  }
}
