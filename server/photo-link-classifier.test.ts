import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyPhotoLink } from './photo-link-classifier.js';

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
