import { handoffKey } from './app/handoffs.js';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
});

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(handoffKey(tabId)).catch(() => {});
});
