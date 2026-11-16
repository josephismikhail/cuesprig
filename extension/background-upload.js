import { readWorkspace } from './app/storage.js';
import { prepareHandoff } from './app/handoffs.js';
import { platforms } from './app/schedules.js';
import { isPlatformUrl, fillTextFields } from './platforms.js';
import { transferVideo } from './transfer-video.js';

export const jobKey = (id, platform) => `send:${id}:${platform}`;
const running = new Set();

export async function startBackgroundUpload(browser, id, platform) {
  if (typeof id !== 'string' || !Object.hasOwn(platforms, platform)) throw new Error('Invalid upload request.');
  const key = jobKey(id, platform);
  if (running.has(key)) return;
  running.add(key);
  let tab;
  const update = (state, message) => browser.storage.session.set({ [key]: { state, message, tabId: tab?.id } });
  const { url, name } = platforms[platform];
  try {
    const origin = new URL(url).origin + '/*';
    if (!await browser.permissions.contains({ origins: [origin] })) throw new Error(`Allow access to ${name} to send in the background.`);
    const existing = (await browser.storage.session.get(key))[key];
    if (existing?.tabId && await browser.tabs.get(existing.tabId).catch(() => null)) return;
    const { posts } = await readWorkspace();
    const post = posts.find(item => item.id === id);
    if (!post?.video?.size) throw new Error('Attach a video before sending.');
    await update('running', `Opening ${name} in the background…`);
    tab = await prepareHandoff(browser, id, platform, 'about:blank', { activate: false });
    await update('running', `Opening ${name} in the background…`);
    await browser.tabs.update(tab.id, { url });
    const deadline = Date.now() + 15000;
    let documentId;
    while (Date.now() < deadline) {
      const current = await browser.tabs.get(tab.id);
      if (current.status === 'complete' && current.url && current.url !== 'about:blank') {
        if (!isPlatformUrl(platform, current.url) || /\/(?:login|signin)(?:[/?]|$)/i.test(new URL(current.url).pathname)) break;
        const [probe] = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: () => true });
        if (probe?.documentId) {
          documentId = probe.documentId;
          const [ready] = await browser.scripting.executeScript({
            target: { tabId: tab.id, documentIds: [documentId] },
            func: () => Boolean(document.querySelector('input[type="file"]:not(:disabled)')),
          });
          if (ready?.result) break;
        }
      }
      documentId = undefined;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    if (!documentId) {
      await update('review', `${name} needs sign-in or an open upload editor.`);
      return;
    }
    const inject = async (func, ...args) => {
      const [result] = await browser.scripting.executeScript({ target: { tabId: tab.id, documentIds: [documentId] }, func, args });
      return result?.result;
    };
    await transferVideo(inject, post.video, percent => update('running', `Sending video to ${name} · ${percent}%`));
    const fields = await inject(fillTextFields, { title: post.title, description: post.description, platform });
    await update('review', fields?.length
      ? `Video handed to ${name}. Check the upload and finish scheduling there.`
      : `Video handed to ${name}. Finish editing and scheduling there.`);
  } catch (error) {
    await update(tab ? 'review' : 'error', error.message || 'Background upload could not finish.');
  } finally {
    running.delete(key);
  }
}
