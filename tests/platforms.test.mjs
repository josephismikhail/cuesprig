import test from 'node:test';
import assert from 'node:assert/strict';
const { isPlatformUrl, isTransferTab, initializeVideoTransfer } = await import('../dist/cuesprig/platforms.js');

test('platform matching rejects lookalike hosts, insecure URLs and other platforms', () => {
  assert.equal(isPlatformUrl('youtube', 'https://studio.youtube.com/channel/example'), true);
  assert.equal(isPlatformUrl('youtube', 'https://studio.youtube.com.evil.example'), false);
  assert.equal(isPlatformUrl('youtube', 'http://studio.youtube.com/'), false);
  assert.equal(isPlatformUrl('tiktok', 'https://www.instagram.com/'), false);
  assert.equal(isPlatformUrl('unknown', 'https://www.tiktok.com/'), false);
  assert.equal(isPlatformUrl('instagram', 'invalid'), false);
});


test('transfer requires the tab opened for this post and the selected platform', () => {
  const pending = { platform: 'youtube', tabId: 42 };
  assert.equal(isTransferTab(pending, { id: 42, url: 'https://studio.youtube.com/' }), true);
  assert.equal(isTransferTab(pending, { id: 17, url: 'https://studio.youtube.com/' }), false);
  assert.equal(isTransferTab(pending, { id: 42, url: 'https://www.instagram.com/' }), false);
  assert.equal(isTransferTab({ platform: 'youtube' }, { url: 'https://studio.youtube.com/' }), false);
});

test('video handoff rejects image-only and ambiguous upload inputs', t => {
  const photo = { accept: 'image/*' };
  const video = { accept: 'video/*' };
  let inputs = [photo];
  globalThis.document = { querySelectorAll: () => inputs };
  t.after(() => { delete globalThis.document; delete globalThis.cuesprigUpload; });
  assert.equal(initializeVideoTransfer(), false);
  inputs = [video, { accept: '.mp4' }];
  assert.equal(initializeVideoTransfer(), false);
  inputs = [photo, video];
  assert.equal(initializeVideoTransfer(), true);
  assert.equal(globalThis.cuesprigUpload.input, video);
});
