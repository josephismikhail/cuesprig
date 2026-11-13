import test from 'node:test';
import assert from 'node:assert/strict';
const { isPlatformUrl } = await import('../dist/cuesprig/platforms.js');

test('platform matching rejects lookalike hosts, insecure URLs and other platforms', () => {
  assert.equal(isPlatformUrl('youtube', 'https://studio.youtube.com/channel/example'), true);
  assert.equal(isPlatformUrl('youtube', 'https://studio.youtube.com.evil.example'), false);
  assert.equal(isPlatformUrl('youtube', 'http://studio.youtube.com/'), false);
  assert.equal(isPlatformUrl('tiktok', 'https://www.instagram.com/'), false);
  assert.equal(isPlatformUrl('unknown', 'https://www.tiktok.com/'), false);
  assert.equal(isPlatformUrl('instagram', 'invalid'), false);
});
