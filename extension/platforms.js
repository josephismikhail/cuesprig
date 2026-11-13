import { platforms } from './app/schedules.js';
export { platforms };

export function isPlatformUrl(platform, url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && Boolean(platforms[platform]?.hosts.includes(parsed.hostname));
  } catch { return false; }
}

export function isTransferTab(pending, tab) {
  return Number.isInteger(pending?.tabId) && tab?.id === pending.tabId && isPlatformUrl(pending.platform, tab.url);
}

export function initializeVideoTransfer() {
  const inputs = Array.from(document.querySelectorAll('input[type="file"]')).filter(input => !input.disabled);
  const videoInputs = inputs.filter(input => /(?:video\/|\.(?:mp4|mov|webm|m4v)\b)/i.test(input.accept));
  const candidates = videoInputs.length ? videoInputs : inputs.filter(input => !input.accept);
  if (candidates.length !== 1) return false;
  globalThis.cuesprigUpload = { input: candidates[0], chunks: [] };
  return true;
}

export function fillTextFields({ title, description, platform }) {
  const selectors = platform === 'youtube'
    ? ['#title-textarea #textbox', '#description-textarea #textbox']
    : platform === 'tiktok'
      ? [null, '[contenteditable="true"][data-e2e="caption-input"], .public-DraftEditor-content [contenteditable="true"]']
      : [null, 'textarea[aria-label*="caption" i], [contenteditable="true"][role="textbox"]'];
  const results = [];
  for (const [index, selector] of selectors.entries()) {
    if (!selector) continue;
    const element = document.querySelector(selector);
    if (!element) continue;
    const value = index === 0 ? title : description;
    element.focus();
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    } else {
      element.textContent = value;
    }
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    results.push(index === 0 ? 'title' : 'description');
  }
  return results;
}
