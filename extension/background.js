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
  if (message?.type !== 'cuesprig:send' || sender.id !== chrome.runtime.id ||
      sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL('app/index.html')) return;
  startBackgroundUpload(chrome, message.id, message.platform).then(
    () => respond({ ok: true }),
    error => respond({ error: error.message }),
  );
  return true;
});
