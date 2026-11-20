import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyPhotoLink, isPublicDriveImage, photoDisplayUrl } from './photo-link-classifier.js';

test('recognizes public Google Drive file link shapes without downloading', () => {
  const fileId = '1AbCdEfGhIjKlMnOpQrStUv';
  assert.deepEqual(classifyPhotoLink(`https://drive.google.com/file/d/${fileId}/view?usp=sharing`), {
    kind: 'google_drive', fileId,
  });
  assert.deepEqual(classifyPhotoLink(`https://drive.google.com/open?id=${fileId}`), {
    kind: 'google_drive', fileId,
  });
  assert.deepEqual(classifyPhotoLink(`https://drive.google.com/uc?id=${fileId}&export=download`), {
    kind: 'google_drive', fileId,
  });
  assert.deepEqual(classifyPhotoLink(`https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`), {
    kind: 'google_drive', fileId,
  });
});

test('classifies Facebook page links but does not claim image access', () => {
  assert.equal(classifyPhotoLink('https://www.facebook.com/photo.php?fbid=123').kind, 'facebook_page');
  assert.equal(classifyPhotoLink('https://m.facebook.com/example/photos/123').kind, 'facebook_page');
});

test('accepts an ordinary HTTPS image URL without fetching it', () => {
  assert.deepEqual(classifyPhotoLink('https://example.org/photo.jpg'), {
    kind: 'direct_https', url: 'https://example.org/photo.jpg',
  });
});

test('rejects unsupported and credential-bearing URLs', () => {
  assert.deepEqual(classifyPhotoLink('javascript:alert(1)'), { kind: 'invalid', reason: 'UNSUPPORTED_PROTOCOL' });
  assert.deepEqual(classifyPhotoLink('http://example.org/photo.jpg'), { kind: 'invalid', reason: 'UNSUPPORTED_PROTOCOL' });
  assert.deepEqual(classifyPhotoLink('https://example.org:8443/photo.jpg'), { kind: 'invalid', reason: 'UNSUPPORTED_PROTOCOL' });
  assert.deepEqual(classifyPhotoLink('https://user:pass@example.org/photo.jpg'), { kind: 'invalid', reason: 'CREDENTIALS_NOT_ALLOWED' });
  assert.deepEqual(classifyPhotoLink('https://drive.google.com/drive/folders/abc'), { kind: 'invalid', reason: 'UNSUPPORTED_DRIVE_LINK' });
  assert.deepEqual(classifyPhotoLink(''), { kind: 'invalid', reason: 'INVALID_URL' });
  assert.deepEqual(classifyPhotoLink('not a url'), { kind: 'invalid', reason: 'INVALID_URL' });
});

test('rejects obvious loopback and private-network hosts', () => {
  for (const host of ['localhost', 'api.localhost', 'localhost.', 'api.localhost.', 'device.local', 'device.local.', 'service.internal', '127.0.0.1', '10.0.0.5', '192.168.1.2', '172.16.0.1', '169.254.169.254', '[::1]', '[fc00::1]', '[fe80::1]', '[::ffff:127.0.0.1]', '127.1', '2130706433', '0x7f000001', '8.8.8.8']) {
    assert.deepEqual(classifyPhotoLink(`https://${host}/photo.jpg`), { kind: 'invalid', reason: 'INVALID_URL' });
  }
});

// Real user-supplied Drive sharing URL. This test validates parsing only;
// it deliberately does not fetch the remote photo or assume public access.
test('recognizes the supplied Google Drive photo sharing URL', () => {
  const link = 'https://drive.google.com/file/d/1h9_zgEqrDMpTiULQwh117oh0vFlYUJYU/view?usp=drivesdk';
  assert.deepEqual(classifyPhotoLink(link), {
    kind: 'google_drive', fileId: '1h9_zgEqrDMpTiULQwh117oh0vFlYUJYU',
  });
});

test('does not confuse lookalike hosts with trusted Google Drive or Facebook', () => {
  assert.equal(classifyPhotoLink('https://drive.google.com.attacker.example/file/d/1h9_zgEqrDMpTiULQwh117oh0vFlYUJYU/view').kind, 'direct_https');
  assert.equal(classifyPhotoLink('https://facebook.com.attacker.example/photo.php').kind, 'direct_https');
  assert.deepEqual(classifyPhotoLink('https://drive.google.com/drive/folders/1h9_zgEqrDMpTiULQwh117oh0vFlYUJYU'), {
    kind: 'invalid', reason: 'UNSUPPORTED_DRIVE_LINK',
  });
});

test('turns Drive sharing links into browser image URLs and rejects Facebook pages', () => {
  const drive = classifyPhotoLink('https://drive.google.com/file/d/1h9_zgEqrDMpTiULQwh117oh0vFlYUJYU/view?usp=drivesdk');
  assert.equal(photoDisplayUrl(drive), 'https://drive.google.com/thumbnail?id=1h9_zgEqrDMpTiULQwh117oh0vFlYUJYU&sz=w1000');
  assert.equal(photoDisplayUrl(classifyPhotoLink('https://www.facebook.com/photo.php?fbid=123')), null);
  assert.equal(photoDisplayUrl(classifyPhotoLink('https://example.org/page')), null);
  assert.equal(photoDisplayUrl(classifyPhotoLink('https://scontent.xx.fbcdn.net/v/t1/photo.jpg?token=1')),
    'https://scontent.xx.fbcdn.net/v/t1/photo.jpg?token=1');
});

test('checks Drive image MIME and only follows trusted HTTPS redirects', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, init) => {
      assert.equal(init?.method, 'HEAD');
      assert.equal(init?.redirect, 'manual');
      return new Response(null, { status: 302, headers: { location: 'https://lh3.googleusercontent.com/d/test=w1000' } });
    };
    assert.equal(await isPublicDriveImage('1h9_zgEqrDMpTiULQwh117oh0vFlYUJYU'), false);
    globalThis.fetch = async (input) => String(input).includes('lh3.googleusercontent.com')
      ? new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } })
      : new Response(null, { status: 302, headers: { location: 'https://lh3.googleusercontent.com/d/test=w1000' } });
    assert.equal(await isPublicDriveImage('1h9_zgEqrDMpTiULQwh117oh0vFlYUJYU'), true);
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://localhost/private' } });
    assert.equal(await isPublicDriveImage('1h9_zgEqrDMpTiULQwh117oh0vFlYUJYU'), false);
    globalThis.fetch = async () => new Response(null, { status: 200, headers: { 'content-type': 'text/html' } });
    assert.equal(await isPublicDriveImage('1h9_zgEqrDMpTiULQwh117oh0vFlYUJYU'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
