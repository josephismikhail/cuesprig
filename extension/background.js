import { checkConnection, connectionKey, guideKey, isConnectionPage } from './app/connections.js';
import { readWorkspace } from './app/storage.js';
import { startBackgroundUpload, jobKey } from './background-upload.js';
import { readHandoff } from './app/handoffs.js';
import { handoffKey } from './app/handoffs.js';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
});

chrome.tabs.onRemoved.addListener(async tabId => {
  await chrome.storage.session.remove(guideKey(tabId));
  const handoff = await readHandoff(chrome, tabId);
  if (handoff) {
    const key = jobKey(handoff.id, handoff.platform);
    const job = (await chrome.storage.session.get(key))[key];
    if (job?.tabId === tabId) await chrome.storage.session.remove(key);
  }
  await chrome.storage.session.remove(handoffKey(tabId));
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'cuesprig:account-guide' && sender.id === chrome.runtime.id && sender.frameId === 0) {
    runAccountGuide(message, sender).then(respond, error => respond({ error: error.message }));
    return true;
  }
  if (sender.id !== chrome.runtime.id ||
      sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL('app/index.html')) return;
  if (message?.type !== 'cuesprig:send') return;
  startBackgroundUpload(chrome, message.id, message.platform).then(
    () => respond({ ok: true }),
    error => respond({ error: error.message }),
  );
  return true;
});

chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.status !== 'complete') return;
  const key = guideKey(tabId);
  const guide = (await chrome.storage.session.get(key))[key];
  if (!guide || !isConnectionPage(guide.platform, tab.url)) return;
  await chrome.scripting.executeScript({ target: { tabId }, files: ['account-guide.js'] }).catch(() => {});
});

async function runAccountGuide(message, sender) {
  const tabId = sender.tab?.id;
  const sessionKey = guideKey(tabId);
  const guide = (await chrome.storage.session.get(sessionKey))[sessionKey];
  if (!guide || !isConnectionPage(guide.platform, sender.url)) throw new Error('Start again from Edit brand.');
  const { brandId, platform, sourceId } = guide;
  const key = connectionKey(brandId, platform);
  const { brands } = await readWorkspace();
  const brand = brands.find(item => item.id === brandId);
  const connection = (await chrome.storage.local.get(key))[key];
  if (!brand || connection?.tabId !== tabId) throw new Error('Start again from Edit brand.');
  const account = await checkConnection(chrome, brandId, platform, { documentId: sender.documentId, save: false });
  if (!message.accountId) return { ok: true, account, brandName: brand.name };
  if (account.id !== message.accountId) throw new Error('The active account changed. Check again.');
  const current = (await chrome.storage.local.get(key))[key];
  if (current?.tabId !== tabId) throw new Error('Start again from Edit brand.');
  await chrome.storage.local.set({ [key]: { state: 'connected', account, verifiedAt: Date.now() } });
  await chrome.storage.session.remove(sessionKey);
  if (Number.isInteger(sourceId)) await chrome.tabs.update(sourceId, { active: true }).catch(() => {});
  return { ok: true, linked: true };
}
