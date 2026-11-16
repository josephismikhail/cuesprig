import { transferVideo } from './transfer-video.js';
import { downloadVideo } from './app/download-video.js';
import { readHandoff } from './app/handoffs.js';
import { readWorkspace } from './app/storage.js';
import { platforms, isTransferTab, fillTextFields } from './platforms.js';

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
    const inject = async (func, ...args) => {
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
      return result?.result;
    };
    await transferVideo(inject, post.video, percent => {
      status.textContent = `Preparing video ${percent}%`;
    });
    status.textContent = 'Video handed to the platform. Wait for its upload to finish, then review the account and schedule.';
  } finally { button.disabled = false; }
}));
