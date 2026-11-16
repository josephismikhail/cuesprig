import test from 'node:test';
import assert from 'node:assert/strict';
import { openConnection, checkConnection, connectionKey, detectAccount } from '../public/connections.js';

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
    await assert.rejects(checkConnection(browser, 'brand-a', platform), /not detected|click Profile/);
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
  globalThis.document = { querySelectorAll: () => [], querySelector: () => null };
  globalThis.location = {hostname:'www.instagram.com', pathname:'/someone/'};
  try { assert.equal(detectAccount('instagram'), null); }
  finally { delete globalThis.document; delete globalThis.location; }
});

test('Instagram recognizes Profile outside a navigation landmark', () => {
  globalThis.location = { hostname: 'www.instagram.com', pathname: '/someone-else/' };
  const profile = { href: 'https://www.instagram.com/My.Studio/', textContent: 'Profile',
    getAttribute: () => null, closest: () => null, querySelector: () => null };
  globalThis.document = { querySelectorAll: () => [profile], querySelector: () => null };
  try { assert.equal(detectAccount('instagram')?.id, 'my.studio'); }
  finally { delete globalThis.document; delete globalThis.location; }
});

test('Instagram recognizes an own-profile page with the Edit profile control', () => {
  globalThis.location = { hostname: 'www.instagram.com', pathname: '/my.studio/' };
  globalThis.document = { querySelectorAll: () => [], querySelector: () => ({ closest: () => null }) };
  try { assert.equal(detectAccount('instagram')?.id, 'my.studio'); }
  finally { delete globalThis.document; delete globalThis.location; }
});
