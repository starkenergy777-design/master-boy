import { Router } from 'express';
import { financialTerms, FINANCIAL_TERMS_VERSION } from '../src/financialTerms.js';
import { readFileSync } from 'node:fs';
import { db } from './db.js';
import { professionSeo } from './professionSeo.js';
import { getPlatformInformation } from './platformInformation.js';
import { informationFor, formatPublicPrice } from '../src/platformInformation.js';

export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
const profilePath = (id: string) => `/xelosani/${encodeURIComponent(id)}`;
const categoryPath = (city: string, profession: string) => `/xelosnebi/${encodeURIComponent(city)}/${encodeURIComponent(profession)}`;
const professionPath = (id: string) => `/profesiebi/${encodeURIComponent(id)}`;
const publicImage = (value: string | undefined, origin: string) => {
  try {
    const url = new URL(value || '/icons/icon-512.jpg', origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : `${origin}/icons/icon-512.jpg`;
  } catch { return `${origin}/icons/icon-512.jpg`; }
};

function pageMetadata(template: string, title: string, description: string, canonical: string, image: string, graph: unknown[]) {
  return template.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, () => `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace(/<link rel="canonical"[^>]*>/, () => `<link rel="canonical" href="${escapeHtml(canonical)}" />`)
    .replace(/<meta property="og:title"[^>]*>/, () => `<meta property="og:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta property="og:description"[^>]*>/, () => `<meta property="og:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:image"[^>]*>/, () => `<meta property="og:image" content="${escapeHtml(image)}" />`)
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, () => `<script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': graph })}</script>`)
    .replace('</head>', () => `<meta property="og:url" content="${escapeHtml(canonical)}" /><meta property="og:locale" content="ka_GE" /><meta name="robots" content="index, follow, max-image-preview:large" /></head>`);
}
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
    const paths = ['/', '/financial-terms', '/platform-info', ...db.professions.filter(p => professionSeo[p.id]).map(p => professionPath(p.id)), ...categories(), ...profiles().map(c => profilePath(c.id))];
    res.set('Cache-Control', 'no-cache').type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p => `<url><loc>${escapeHtml(origin + p)}</loc></url>`).join('')}</urlset>`);
  });
  router.get('/platform-info', (_req, res) => {
    const copy = informationFor('ka');
    const info = getPlatformInformation();
    const terms = financialTerms.ka;
    const paragraphs = (texts: readonly string[]) => texts.map(text => `<p>${escapeHtml(text)}</p>`).join('');
    const section = (index: number, body: string) => `<section id="information-${index}"><h2>${index + 1}. ${escapeHtml(copy.headings[index])}</h2>${body}</section>`;
    const contacts = Object.values(info.merchant).map((value, i) => `<p>${escapeHtml(copy.contactLabels[i])}: ${escapeHtml(value || '—')}</p>`).join('');
    const priceTable = info.top15.length ? `<details><summary>${escapeHtml(copy.allPrices)}</summary><table><thead><tr><th>${escapeHtml(copy.category)}</th><th>${escapeHtml(copy.price)}</th></tr></thead><tbody>${info.top15.map(row => `<tr><td>${escapeHtml(row.city)} / ${escapeHtml(row.profession)}</td><td>${escapeHtml(formatPublicPrice(row))}</td></tr>`).join('')}</tbody></table></details>` : '';
    const prices = [...new Set(info.top15.map(formatPublicPrice))];
    const financial = `<h3>${escapeHtml(copy.financial)}</h3><small>${FINANCIAL_TERMS_VERSION}</small>${paragraphs([terms.introduction])}${terms.sections.map(([heading, body]) => `<h4>${escapeHtml(heading)}</h4>${paragraphs([body])}`).join('')}<a href="/financial-terms">${escapeHtml(terms.title)}</a>`;
    const content = `<main style="max-width:720px;margin:auto;padding:16px;overflow-wrap:anywhere"><a href="/">Master Boy</a><h1>${escapeHtml(copy.title)}</h1>${section(0, paragraphs(copy.about))}${section(1, contacts)}${section(2, paragraphs(copy.services))}${section(3, paragraphs([`${copy.listing}: ${formatPublicPrice(info.listing)}`, `${copy.top15}: ${prices.join(' / ') || copy.unavailable}`, copy.pricing]) + priceTable)}${section(4, paragraphs(copy.delivery) + financial)}${section(5, paragraphs(copy.privacy))}${section(6, paragraphs(copy.usage))}</main>`;
    const title = `${copy.title} | Master Boy`;
    const description = copy.about[0];
    const canonical = `${origin}/platform-info`;
    const html = pageMetadata(template, title, description, canonical, publicImage(undefined, origin), [{ '@type': 'WebPage', name: title, url: canonical, inLanguage: 'ka' }])
      .replace(/<div id="root">[\s\S]*?<script src="\/app-bootstrap.js"><\/script>/, () => `<div id="root">${content}</div><script type="application/json" id="mb-public-page">${json({ screen: 'platform-info', title })}</script><script src="/app-bootstrap.js"></script>`);
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  });
  router.get('/financial-terms', (_req, res) => {
    const terms = financialTerms.ka;
    const disclosure = db.merchantDisclosure;
    const title = `${terms.title} | მასტერ ბოი`;
    const merchant = `<section><h2>Master Boy — საკონტაქტო და საიდენტიფიკაციო ინფორმაცია</h2><p>იურიდიული დასახელება: ${escapeHtml(disclosure.legalName || 'არ არის მითითებული')}</p><p>საიდენტიფიკაციო კოდი: ${escapeHtml(disclosure.identificationCode || 'არ არის მითითებული')}</p><p>მისამართი: ${escapeHtml(disclosure.address || 'არ არის მითითებული')}</p><p>ტელეფონი: ${escapeHtml(disclosure.phone || 'არ არის მითითებული')}</p><p>ელფოსტა: ${escapeHtml(disclosure.email || 'არ არის მითითებული')}</p></section>`;
    const content = `<main style="max-width:720px;margin:auto;padding:24px"><a href="/">მასტერ ბოი</a><h1>${escapeHtml(terms.title)}</h1>${merchant}<p>${escapeHtml(terms.introduction)}</p>${terms.sections.map(([heading, body]) => `<section><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(body)}</p></section>`).join('')}<small>${FINANCIAL_TERMS_VERSION}</small></main>`;
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
      const ordered = [...selected].sort((a, b) => Number(!!b.isTop15) - Number(!!a.isTop15));
      const links = (profile ? [profile] : ordered).map(c => `<li><a href="${profilePath(c.id)}">${escapeHtml(c.name)} — ${escapeHtml(c.professionName)}, ${escapeHtml(c.cityName)}</a>${c.isTop15 ? ' <span>TOP 15</span>' : ''}</li>`).join('');
      const professionContent = professionInfo ? `<p>${escapeHtml(professionInfo.service)}</p><p>${escapeHtml(professionInfo.ask)}</p><p>აირჩიეთ ქალაქი და შეამოწმეთ ხელმისაწვდომი ხელოსნები. შედეგები აქტიური პროფილების მიხედვით განახლდება.</p>` : '';
      const content = `<main style="max-width:512px;margin:auto;padding:24px"><a href="/">მასტერ ბოი — Master Boy</a><h1>${escapeHtml(profession?.name.ka || title)}</h1>${professionContent || `<p>${escapeHtml(description)}</p>`}${profile?.phone ? `<p>${escapeHtml(profile.phone)}</p>` : ''}${profile?.primaryPhotoUrl ? `<img src="${escapeHtml(publicImage(profile.primaryPhotoUrl, origin))}" alt="${escapeHtml(profile.name)}" width="240" />` : ''}${links ? `<ul>${links}</ul>` : ''}${profession && !links ? '<p>ამ პროფესიაში ამჟამად აქტიური ხელოსნის პროფილი არ არის გამოქვეყნებული.</p>' : ''}${!profile && !profession ? `<nav>${[...new Map(selected.map(c => [categoryPath(c.cityId,c.professionId),c])).entries()].map(([p,c]) => `<p><a href="${p}">${escapeHtml(c.professionName)} — ${escapeHtml(c.cityName)}</a></p>`).join('')}</nav>` : ''}</main>`;
      const bootstrap = { screen: profile ? 'detail' : isCategory || profession ? 'results' : 'main', title, description, craftsman: profile || null, cityId: req.params.city, professionId: req.params.profession };
      const website = { '@type': 'WebSite', '@id': `${origin}/#website`, name: 'Master Boy', alternateName: ['მასტერ ბოი', 'MASTER_BOY'], url: `${origin}/`, inLanguage: 'ka' };
      const graph: unknown[] = [website, {
        '@type': profile ? 'WebPage' : 'CollectionPage', '@id': `${canonical}#webpage`, url: canonical,
        name: title, description, inLanguage: 'ka', isPartOf: { '@id': website['@id'] },
        ...(profile ? { mainEntity: { '@id': `${canonical}#craftsman` } } : {}),
      }];
      if (profile) {
        graph.push({ '@type': 'LocalBusiness', '@id': `${canonical}#craftsman`, name: profile.name, url: canonical,
          description: `${profile.professionName}, ${profile.cityName}. ${profile.description || ''}`,
          address: { '@type': 'PostalAddress', addressLocality: profile.cityName, addressCountry: 'GE' },
          areaServed: { '@type': 'City', name: profile.cityName },
          ...(profile.phone ? { telephone: profile.phone } : {}),
          ...(profile.primaryPhotoUrl ? { image: publicImage(profile.primaryPhotoUrl, origin) } : {}),
        });
      } else if (isCategory || profession) {
        graph.push({ '@type': 'ItemList', '@id': `${canonical}#craftsmen`, numberOfItems: ordered.length,
          itemListElement: ordered.map((c, index) => ({ '@type': 'ListItem', position: index + 1, name: c.name, url: origin + profilePath(c.id) })),
        });
      }
      if (profile || isCategory || profession) {
        graph.push({ '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'მასტერ ბოი', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: profile?.name || profession?.name.ka || title, item: canonical },
        ] });
      }
      let html = pageMetadata(template, title, description, canonical, publicImage(profile?.primaryPhotoUrl, origin), graph);
      if (req.path === '/') {
        // These same profession links remain available in MainScreen after React loads.
        const directory = `<nav aria-label="ხელოსნების პროფესიები"><details><summary>ყველა პროფესიის ნახვა</summary>${db.professions.filter(p => professionSeo[p.id]).map(p => `<p><a href="${professionPath(p.id)}">${escapeHtml(p.name.ka)}</a></p>`).join('')}</details></nav>`;
        html = html.replace('<div id="mb-connection-notice"', () => `${directory}<a href="/platform-info">კომპანიის ინფორმაცია და პირობები</a><div id="mb-connection-notice"`)
          .replace('<script src="/app-bootstrap.js"></script>', () => `<script type="application/json" id="mb-public-page">${json(bootstrap)}</script><script src="/app-bootstrap.js"></script>`);
      } else {
        html = html.replace(/<div id="root">[\s\S]*?<script src="\/app-bootstrap.js"><\/script>/, () => `<div id="root">${content}</div><script type="application/json" id="mb-public-page">${json(bootstrap)}</script><script src="/app-bootstrap.js"></script>`);
      }
      res.set('Cache-Control', 'no-cache').type('html').send(html);
    } catch (error) { next(error); }
  });
  return router;
}
