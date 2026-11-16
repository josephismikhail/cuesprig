import { openConnection, checkConnection } from './connections.js';
import { startBackgroundUpload, jobKey } from './background-upload.js';
import { readHandoff } from './app/handoffs.js';
import { handoffKey } from './app/handoffs.js';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
});

chrome.tabs.onRemoved.addListener(async tabId => {
  const handoff = await readHandoff(chrome, tabId);
  if (handoff) {
    const key = jobKey(handoff.id, handoff.platform);
    const job = (await chrome.storage.session.get(key))[key];
    if (job?.tabId === tabId) await chrome.storage.session.remove(key);
  }
  await chrome.storage.session.remove(handoffKey(tabId));
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id ||
      sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL('app/index.html')) return;
  const action = message.type === 'cuesprig:connect' ? () => openConnection(chrome, message.brandId, message.platform)
    : message.type === 'cuesprig:check-account' ? () => checkConnection(chrome, message.brandId, message.platform)
    : message.type === 'cuesprig:send' ? () => startBackgroundUpload(chrome, message.id, message.platform) : null;
  if (!action) return;
  action().then(
    result => respond({ ok: true, result }),
    error => respond({ error: error.message }),
  );
  return true;
});
