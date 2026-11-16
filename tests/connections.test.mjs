import test from 'node:test';
import assert from 'node:assert/strict';
import { openConnection, checkConnection, connectionKey, detectAccount } from '../extension/connections.js';

for (const platform of ['youtube', 'instagram', 'tiktok']) {
  test(`${platform} connection stays pending until an account is detected`, async () => {
    const saved = {};
    let tab;
    const browser = {
      tabs: {
        create: async ({url}) => (tab = {id: 7, url}),
        get: async () => tab,
      },
      storage: { local: {
        set: async values => Object.assign(saved, values),
        get: async key => ({[key]:saved[key]}),
      } },
      scripting: { executeScript: async () => [{result:null}] },
    };
    await openConnection(browser, 'brand-a', platform);
    assert.equal(saved[connectionKey('brand-a', platform)].state, 'pending');
    await assert.rejects(checkConnection(browser, 'brand-a', platform), /not detected/);
    const account = {id:'sample', name:'Sample',url:tab.url};
    browser.scripting.executeScript = async () => [{result:account}];
    assert.deepEqual(await checkConnection(browser, 'brand-a', platform), account);
    assert.equal(saved[connectionKey('brand-a', platform)].state, 'detected');
    assert.equal(saved[connectionKey('brand-b', platform)], undefined);
    tab.url = 'https://example.com/';
    await assert.rejects(checkConnection(browser, 'brand-a', platform), /Finish signing in/);
  });
}

test('public Instagram profile pages are not treated as the signed-in account', () => {
  globalThis.document = { querySelectorAll: () => [] };
  globalThis.location = {hostname:'www.instagram.com', pathname:'/someone/'};
  try { assert.equal(detectAccount('instagram'), null); }
  finally { delete globalThis.document; delete globalThis.location; }
});
