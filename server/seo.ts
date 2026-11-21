import { Router } from 'express';
import { financialTerms, FINANCIAL_TERMS_VERSION } from '../src/financialTerms.js';
import { readFileSync } from 'node:fs';
import { db } from './db.js';
import { professionSeo } from './professionSeo.js';

export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
const profilePath = (id: string) => `/xelosani/${encodeURIComponent(id)}`;
const categoryPath = (city: string, profession: string) => `/xelosnebi/${encodeURIComponent(city)}/${encodeURIComponent(profession)}`;
const professionPath = (id: string) => `/profesiebi/${encodeURIComponent(id)}`;
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
    const paths = ['/', '/financial-terms', ...db.professions.filter(p => professionSeo[p.id]).map(p => professionPath(p.id)), ...categories(), ...profiles().map(c => profilePath(c.id))];
    res.set('Cache-Control', 'no-cache').type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p => `<url><loc>${escapeHtml(origin + p)}</loc></url>`).join('')}</urlset>`);
  });
  router.get('/financial-terms', (_req, res) => {
    const terms = financialTerms.ka;
    const title = `${terms.title} | მასტერ ბოი`;
    const content = `<main style="max-width:720px;margin:auto;padding:24px"><a href="/">მასტერ ბოი</a><h1>${escapeHtml(terms.title)}</h1><p>${escapeHtml(terms.introduction)}</p>${terms.sections.map(([heading, body]) => `<section><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(body)}</p></section>`).join('')}<small>${FINANCIAL_TERMS_VERSION}</small></main>`;
    const bootstrap = { screen: 'financial-terms', title };
    const html = template.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
      .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${origin}/financial-terms" />`)
      .replace(/<div id="root">[\s\S]*?<script src="\/app-bootstrap.js"><\/script>/, `<div id="root">${content}</div><script type="application/json" id="mb-public-page">${json(bootstrap)}</script><script src="/app-bootstrap.js"></script>`);
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  });
  router.get(['/', '/xelosani/:id', '/xelosnebi/:city/:profession', '/profesiebi/:profession'], (req, res, next) => {
    try {
      const all = profiles();
      const profile = req.params.id ? all.find(c => c.id === req.params.id) : undefined;
      const isCategory = !!req.params.city;
      const isProfession = req.path.startsWith('/profesiebi/');
      const profession = isProfession ? db.professions.find(p => p.id === req.params.profession && professionSeo[p.id]) : undefined;
      const selected = isCategory ? all.filter(c => c.cityId === req.params.city && c.professionId === req.params.profession) : isProfession ? all.filter(c => c.professionId === req.params.profession) : all;
      if ((req.params.id && !profile) || (isCategory && !selected.length) || (isProfession && !profession)) {
        return res.status(404).set('X-Robots-Tag', 'noindex').type('html').send('<!doctype html><html lang="ka"><meta charset="utf-8"><title>გვერდი ვერ მოიძებნა | მასტერ ბოი</title><h1>გვერდი ვერ მოიძებნა</h1><a href="/">მასტერ ბოი</a></html>');
      }
      const professionInfo = profession && professionSeo[profession.id];
      const title = profile ? `${profile.name} — ${profile.professionName}, ${profile.cityName} | მასტერ ბოი` : isCategory ? `${selected[0].professionName} — ${selected[0].cityName} | მასტერ ბოი` : profession && professionInfo ? `${profession.name.ka} — ${professionInfo.also} | მასტერ ბოი` : 'Master Boy | მასტერ ბოი — მოძებნე ხელოსანი საქართველოში';
      const description = profile ? `${profile.name}: ${profile.professionName}, ${profile.cityName}. ${profile.description || ''}`.slice(0, 300) : professionInfo ? `${professionInfo.service} ${professionInfo.also}. მოძებნეთ ხელოსანი მასტერ ბოიში ქალაქისა და პროფესიის მიხედვით.` : 'მასტერ ბოი (Master Boy) — მოძებნე ხელოსანი ქალაქისა და პროფესიის მიხედვით საქართველოში. ძიება რეგისტრაციის გარეშე.';
      const canonical = origin + (profile ? profilePath(profile.id) : isCategory ? categoryPath(req.params.city, req.params.profession) : profession ? professionPath(profession.id) : '/');
      const links = (profile ? [profile] : selected).map(c => `<li><a href="${profilePath(c.id)}">${escapeHtml(c.name)} — ${escapeHtml(c.professionName)}, ${escapeHtml(c.cityName)}</a></li>`).join('');
      const professionContent = professionInfo ? `<p>${escapeHtml(professionInfo.service)}</p><p>${escapeHtml(professionInfo.ask)}</p><p>აირჩიეთ ქალაქი და შეამოწმეთ ხელმისაწვდომი ხელოსნები. შედეგები აქტიური პროფილების მიხედვით განახლდება.</p>` : '';
      const content = `<main style="max-width:512px;margin:auto;padding:24px"><a href="/">მასტერ ბოი — Master Boy</a><h1>${escapeHtml(profession?.name.ka || title)}</h1>${professionContent || `<p>${escapeHtml(description)}</p>`}${profile?.phone ? `<p>${escapeHtml(profile.phone)}</p>` : ''}${links ? `<ul>${links}</ul>` : ''}${profession && !links ? '<p>ამ პროფესიაში ამჟამად აქტიური ხელოსნის პროფილი არ არის გამოქვეყნებული.</p>' : ''}${!profile && !profession ? `<nav>${[...new Map(selected.map(c => [categoryPath(c.cityId,c.professionId),c])).entries()].map(([p,c]) => `<p><a href="${p}">${escapeHtml(c.professionName)} — ${escapeHtml(c.cityName)}</a></p>`).join('')}</nav>` : ''}</main>`;
      const bootstrap = { screen: profile ? 'detail' : isCategory || profession ? 'results' : 'main', title, description, craftsman: profile || null, cityId: req.params.city, professionId: req.params.profession };
      let html = template;
      html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
        .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(description)}" />`)
        .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escapeHtml(canonical)}" />`)
        .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeHtml(title)}" />`)
        .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeHtml(description)}" />`);
      if (req.path === '/') {
        html = html.replace('<script src="/app-bootstrap.js"></script>', `<script type="application/json" id="mb-public-page">${json(bootstrap)}</script><script src="/app-bootstrap.js"></script>`);
      } else {
        html = html.replace(/<div id="root">[\s\S]*?<script src="\/app-bootstrap.js"><\/script>/, `<div id="root">${content}</div><script type="application/json" id="mb-public-page">${json(bootstrap)}</script><script src="/app-bootstrap.js"></script>`);
      }
      res.set('Cache-Control', 'no-cache').type('html').send(html);
    } catch (error) { next(error); }
  });
  return router;
}
