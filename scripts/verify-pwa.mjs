import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path));
const manifest = JSON.parse(read('public/manifest.json').toString('utf8'));
const html = read('index.html').toString('utf8');
const worker = read('public/sw.js').toString('utf8');
const bootstrap = read('public/app-bootstrap.js').toString('utf8');

assert.match(html, /rel="manifest" href="\/manifest.json"/);
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.prefer_related_applications, false);
assert.equal(manifest.id, '/');
for (const icon of manifest.icons) {
  assert.equal(icon.type, 'image/png');
  assert.ok(icon.src.startsWith('/icons/'));
  const bytes = read('public' + icon.src);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.equal(icon.sizes, width + 'x' + height);
  assert.equal(width, height);
  assert.ok(width === 192 || width === 512);
  assert.ok(worker.includes(icon.src), 'Service Worker must cache ' + icon.src);
}
assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
assert.match(bootstrap, /serviceWorker\.register\('\/sw\.js'\)/);
assert.match(bootstrap, /beforeinstallprompt/);
assert.match(bootstrap, /appinstalled/);
assert.match(bootstrap, /sessionStorage\.setItem\('mb-install-dismissed'/);
new Function(bootstrap);
new Function(worker);
console.log('PWA static checks passed: manifest, PNG dimensions, service worker and install prompt.');
