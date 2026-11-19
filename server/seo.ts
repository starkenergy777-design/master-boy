import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { db } from './db.js';

export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
const profilePath = (id: string) => `/xelosani/${encodeURIComponent(id)}`;
const categoryPath = (city: string, profession: string) => `/xelosnebi/${encodeURIComponent(city)}/${encodeURIComponent(profession)}`;
export function publicProfiles() {
  return [...db.craftsmen.values()].filter(c => {
    const listing = db.getCraftsmanListing(c.id);
    return c.status === 'ACTIVE' && listing?.status === 'ACTIVE' &&
      !!listing.expiresAt && Date.parse(listing.expiresAt) > Date.now() &&
      db.users.get(c.userId)?.status === 'ACTIVE';
  }).map(c => db.toPublicCraftsman(c, 'ka'));
}

export function seoRouter(templatePath: string) {
  const router = Router();
  const template = readFileSync(templatePath, 'utf8');
  const origin = new URL(process.env.APP_ORIGIN || process.env.APP_URL || 'https://master-boy.onrender.com').origin;
  const profiles = () => publicProfiles();
  const categories = () => [...new Set(profiles().map(c => categoryPath(c.cityId, c.professionId)))];
  router.get('/index.html', (_req, res) => res.redirect(301, '/'));
  router.get('/robots.txt', (_req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`));
  router.get('/sitemap.xml', (_req, res) => {
    const paths = ['/', ...categories(), ...profiles().map(c => profilePath(c.id))];
    res.set('Cache-Control', 'no-cache').type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p => `<url><loc>${escapeHtml(origin + p)}</loc></url>`).join('')}</urlset>`);
  });
  router.get(['/', '/xelosani/:id', '/xelosnebi/:city/:profession'], (req, res, next) => {
    try {
      const all = profiles();
      const profile = req.params.id ? all.find(c => c.id === req.params.id) : undefined;
      const isCategory = !!req.params.city;
      const selected = isCategory ? all.filter(c => c.cityId === req.params.city && c.professionId === req.params.profession) : all;
      if ((req.params.id && !profile) || (isCategory && !selected.length)) {
        return res.status(404).set('X-Robots-Tag', 'noindex').type('html').send('<!doctype html><html lang="ka"><meta charset="utf-8"><title>გვერდი ვერ მოიძებნა | მასტერ ბოი</title><h1>გვერდი ვერ მოიძებნა</h1><a href="/">მასტერ ბოი</a></html>');
      }
      const title = profile ? `${profile.name} — ${profile.professionName}, ${profile.cityName} | მასტერ ბოი` : isCategory ? `${selected[0].professionName} — ${selected[0].cityName} | მასტერ ბოი` : 'Master Boy | მასტერ ბოი — მოძებნე ხელოსანი საქართველოში';
      const description = profile ? `${profile.name}: ${profile.professionName}, ${profile.cityName}. ${profile.description || ''}`.slice(0, 300) : 'მასტერ ბოი (Master Boy) — მოძებნე ხელოსანი ქალაქისა და პროფესიის მიხედვით საქართველოში. ძიება რეგისტრაციის გარეშე.';
      const canonical = origin + (profile ? profilePath(profile.id) : isCategory ? categoryPath(req.params.city, req.params.profession) : '/');
      const links = (profile ? [profile] : selected).map(c => `<li><a href="${profilePath(c.id)}">${escapeHtml(c.name)} — ${escapeHtml(c.professionName)}, ${escapeHtml(c.cityName)}</a></li>`).join('');
      const content = `<main style="max-width:512px;margin:auto;padding:24px"><a href="/">მასტერ ბოი — Master Boy</a><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p>${profile?.phone ? `<p>${escapeHtml(profile.phone)}</p>` : ''}<ul>${links}</ul>${!profile ? `<nav>${[...new Map(selected.map(c => [categoryPath(c.cityId,c.professionId),c])).entries()].map(([p,c]) => `<p><a href="${p}">${escapeHtml(c.professionName)} — ${escapeHtml(c.cityName)}</a></p>`).join('')}</nav>` : ''}</main>`;
      const bootstrap = { screen: profile ? 'detail' : isCategory ? 'results' : 'main', title, description, craftsman: profile || null, cityId: req.params.city, professionId: req.params.profession };
      let html = template;
      html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
        .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(description)}" />`)
        .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escapeHtml(canonical)}" />`)
        .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeHtml(title)}" />`)
        .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeHtml(description)}" />`)
        .replace(/<div id="root">[\s\S]*?<script src="\/app-bootstrap.js"><\/script>/, `<div id="root">${content}</div><script type="application/json" id="mb-public-page">${json(bootstrap)}</script><script src="/app-bootstrap.js"></script>`);
      res.set('Cache-Control', 'no-cache').type('html').send(html);
    } catch (error) { next(error); }
  });
  return router;
}
