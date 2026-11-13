import { downloadVideo } from './app/download-video.js';
import { readHandoff } from './app/handoffs.js';
import { readWorkspace } from './app/storage.js';
import { platforms, isTransferTab, initializeVideoTransfer, receiveVideoChunk, finishVideoTransfer, fillTextFields } from './platforms.js';

const status = document.getElementById('status');
let post;
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const pending = await readHandoff(chrome, tab?.id);
if (pending && isTransferTab(pending, tab)) {
  const workspace = await readWorkspace();
  post = workspace.posts.find(item => item.id === pending.id);
}
if (post) {
  document.getElementById('transfer').hidden = false;
  document.getElementById('download-video').disabled = !post.video;
  document.getElementById('upload-video').disabled = !post.video;
  document.getElementById('post-title').textContent = post.title;
  document.getElementById('post-schedule').textContent = `${platforms[pending.platform].name} · ${post.date} ${post.time}`;
}

document.getElementById('open-calendar').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('app/index.html') });
  window.close();
});

document.getElementById('record-schedule').addEventListener('click', async () => {
  if (!post || !pending) return;
  try {
    const route = new URLSearchParams({ record: post.id, platform: pending.platform });
    await chrome.tabs.create({ url: chrome.runtime.getURL(`app/index.html#${route}`) });
    window.close();
  } catch {
    status.textContent = 'Could not open the schedule editor. Open the calendar and record it from the video card.';
  }
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

document.getElementById('download-video').addEventListener('click', () => {
  if (post?.video) downloadVideo(post.video);
});

document.getElementById('upload-video').addEventListener('click', () => onPlatform(async () => {
  const button = document.getElementById('upload-video'); button.disabled = true;
  try {
    if (!post.video) throw new Error('This post has no local video.');
    const [{ result: ready }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, func: initializeVideoTransfer,
    });
    if (!ready) throw new Error('Open a single video upload editor, or download the video and select it in the editor.');
    const chunkSize = 256 * 1024;
    for (let offset = 0; offset < post.video.size; offset += chunkSize) {
      const bytes = new Uint8Array(await post.video.slice(offset, offset + chunkSize).arrayBuffer());
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: receiveVideoChunk, args: [btoa(binary)] });
      status.textContent = `Preparing video ${Math.min(100, Math.round((offset + chunkSize) / post.video.size * 100))}%`;
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id }, func: finishVideoTransfer,
      args: [{ name: post.video.name || 'video.mp4', type: post.video.type || 'video/mp4' }],
    });
    status.textContent = 'Video handed to the platform. Wait for its upload to finish, then review the account and schedule.';
  } catch (error) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { delete globalThis.cuesprigUpload; } }).catch(() => {});
    throw error;
  } finally { button.disabled = false; }
}));
