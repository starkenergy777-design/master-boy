// Isolated HTTP regression checks; never connects to Supabase or creates accounts.
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
delete process.env.SUPABASE_DB_URL;
const { default: express } = await import('express');
const { seoRouter, escapeHtml } = await import('./server/seo.js');
const app = express();
app.use(seoRouter('dist/index.html'));
const listener = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => listener.once('listening', resolve));
const port = (listener.address() as {port:number}).port;
try {
  const get = (path: string) => fetch(`http://127.0.0.1:${port}${path}`);
  const home = await get('/');
  const html = await home.text();
  assert.equal(home.status, 200);
  assert.match(html, /google-site-verification/);
  assert.match(html, /id="mb-public-page"/);
  assert.match(html, /mb-initial-loader/);
  assert.match(html, /<script[^>]+src="\/assets\//);
  assert.doesNotMatch(html, /<main style="max-width:512px/);
  assert.equal((html.match(/id="root"/g) || []).length, 1);
  const sitemap = await (await get('/sitemap.xml')).text();
  assert.equal((sitemap.match(/<loc>/g) || []).length, 1);
  assert.match(sitemap, /https:\/\/master-boy.onrender.com\//);
  const missing = await get('/xelosani/nonexistent');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('x-robots-tag'), 'noindex');
  assert.equal((await get('/xelosnebi/city-tbilisi/prof-plumber')).status, 404);
  assert.match(await (await get('/robots.txt')).text(), /Sitemap:/);
  assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
  console.log('SEO HTTP checks passed: server HTML, bootstrap, assets, verification, sitemap, no invented profiles, empty categories, 404, escaping.');
} finally { listener.close(); }
