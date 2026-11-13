import assert from 'node:assert/strict';
import test from 'node:test';
import { handoffKey, prepareHandoff, readHandoff } from '../public/handoffs.js';

function browserFixture() {
  const storage = new Map();
  const tabs = new Set();
  let sequence = 0;
  return {
    storage: { session: {
      async set(records) { for (const [key, value] of Object.entries(records)) storage.set(key, value); },
      async get(key) { return { [key]: storage.get(key) }; },
      async remove(key) { storage.delete(key); },
    } },
    tabs: {
      async create() { const id = ++sequence; tabs.add(id); return { id }; },
      async update() {},
      async remove(id) { tabs.delete(id); },
    },
    records: storage,
    openTabs: tabs,
  };
}

test('preparing another platform preserves the existing tab handoff', async () => {
  const browser = browserFixture();
  await Promise.all([
    prepareHandoff(browser, 'first', 'youtube', 'https://studio.youtube.com/'),
    prepareHandoff(browser, 'second', 'tiktok', 'https://www.tiktok.com/tiktokstudio/upload'),
  ]);
  assert.deepEqual(await readHandoff(browser, 1), { id: 'first', platform: 'youtube', tabId: 1 });
  assert.deepEqual(await readHandoff(browser, 2), { id: 'second', platform: 'tiktok', tabId: 2 });
  assert.equal(await readHandoff(browser, 3), undefined);
  await browser.storage.session.remove(handoffKey(1));
  assert.equal(await readHandoff(browser, 1), undefined);
  assert.equal((await readHandoff(browser, 2)).id, 'second');
});

test('failed tab activation removes the orphan handoff and tab', async () => {
  const browser = browserFixture();
  browser.tabs.update = async () => { throw new Error('Activation failed'); };
  await assert.rejects(prepareHandoff(browser, 'draft', 'youtube', 'https://studio.youtube.com/'), /Activation failed/);
  assert.equal(browser.records.size, 0);
  assert.equal(browser.openTabs.size, 0);
});
