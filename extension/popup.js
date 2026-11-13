import { readWorkspace } from './app/storage.js';
import { platforms, isTransferTab, initializeVideoTransfer, fillTextFields } from './platforms.js';

const status = document.getElementById('status');
let pending;
let post;
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const state = await chrome.storage.local.get('pendingPost');
pending = state.pendingPost;
if (pending) {
  const workspace = await readWorkspace();
  post = workspace.posts.find(item => item.id === pending.id);
}
if (post && platforms[pending.platform]) {
  document.getElementById('transfer').hidden = false;
  document.getElementById('post-title').textContent = post.title;
  document.getElementById('post-schedule').textContent = `${platforms[pending.platform].name} · ${post.date} ${post.time}`;
}

document.getElementById('open-calendar').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('app/index.html') });
  window.close();
});

async function onPlatform(action) {
  if (!post || !isTransferTab(pending, tab)) {
    status.textContent = 'Use the tab opened by Prepare for this platform, then click Cuesprig again.';
    return;
  }
  try { await action(); }
  catch (error) { status.textContent = `Could not complete this step. ${error.message}`; }
}

document.getElementById('fill-text').addEventListener('click', () => onPlatform(async () => {
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fillTextFields,
    args: [{ title: post.title, description: post.description, platform: pending.platform }] });
  status.textContent = result.result.length ? `Filled ${result.result.join(' and ')}. Review the text before scheduling.` : 'Open the title/caption editor first. You can also copy the text below.';
}));

for (const field of ['title', 'description']) {
  document.getElementById(`copy-${field}`).addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(post[field] || ''); status.textContent = `${field} copied.`; }
    catch { status.textContent = 'Clipboard access failed. Copy the text from the calendar editor.'; }
  });
}

document.getElementById('upload-video').addEventListener('click', () => onPlatform(async () => {
  const button = document.getElementById('upload-video'); button.disabled = true;
  try {
    if (!post.video) throw new Error('This post has no local video.');
    const [{ result: ready }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, func: initializeVideoTransfer,
    });
    if (!ready) throw new Error('Open a single video upload editor, or choose the video manually.');
    const chunkSize = 256 * 1024;
    for (let offset = 0; offset < post.video.size; offset += chunkSize) {
      const bytes = new Uint8Array(await post.video.slice(offset, offset + chunkSize).arrayBuffer());
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: chunk => {
        if (!globalThis.cuesprigUpload?.input.isConnected) throw new Error('Upload dialog changed. Try again.');
        globalThis.cuesprigUpload.chunks.push(Uint8Array.from(atob(chunk), character => character.charCodeAt(0)));
      }, args: [btoa(binary)] });
      status.textContent = `Preparing video ${Math.min(100, Math.round((offset + chunkSize) / post.video.size * 100))}%`;
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: metadata => {
      const upload = globalThis.cuesprigUpload;
      if (!upload?.input.isConnected) throw new Error('Upload dialog closed. Try again.');
      const transfer = new DataTransfer();
      transfer.items.add(new File(upload.chunks, metadata.name, { type: metadata.type }));
      upload.input.files = transfer.files;
      delete globalThis.cuesprigUpload;
      upload.input.dispatchEvent(new Event('change', { bubbles: true }));
    }, args: [{ name: post.video.name || 'video.mp4', type: post.video.type || 'video/mp4' }] });
    status.textContent = 'Video handed to the platform. Wait for its upload to finish, then review the account and schedule.';
  } catch (error) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { delete globalThis.cuesprigUpload; } }).catch(() => {});
    throw error;
  } finally { button.disabled = false; }
}));
