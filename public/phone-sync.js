import { readWorkspace, applyRemoteChanges } from './storage.js';
import { makeSnapshot, sanitizeSnapshot } from './snapshot.js';

const $ = id => document.getElementById(id);
let queue = Promise.resolve();
let busy = false;
const status = message => { $('sync-status').textContent = message; };

function sync() {
  const run = queue.then(async () => {
    const { phoneSync } = await chrome.storage.local.get('phoneSync');
    if (!phoneSync) return;
    const request = (path, method, body) => fetch(`${phoneSync.origin}${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${phoneSync.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (phoneSync.chatgpt) {
      const remote = await request('/api/chatgpt-sync', 'GET');
      if (!remote.ok) throw new Error(`ChatGPT sync failed (${remote.status}). Check your server setup.`);
      const { changes } = await remote.json();
      const results = await applyRemoteChanges(changes, phoneSync.origin, async ({ id, media }) => {
        if (!/^[a-f0-9-]{36}$/.test(id) || !Number.isSafeInteger(media.size) ||
            media.size < 1 || media.size > 100 * 1024 * 1024 ||
            !['video/mp4', 'video/quicktime', 'video/webm'].includes(media.type)) {
          throw new Error('Invalid video import metadata.');
        }
        const response = await fetch(`${phoneSync.origin}/api/chatgpt-video/${id}`, {
          redirect: 'error', signal: AbortSignal.timeout(90000),
          headers: { Authorization: `Bearer ${phoneSync.token}` },
        });
        if (!response.ok) throw new Error(`Could not download the queued video (${response.status}).`);
        if (Number(response.headers.get('content-length')) !== media.size) {
          await response.body?.cancel();
          throw new Error('The imported video size did not match.');
        }
        const blob = await response.blob();
        if (blob.size !== media.size) throw new Error('The imported video size did not match.');
        return new File([blob], media.name, { type: media.type });
      });
      const { posts, brands } = await readWorkspace();
      if (results.some(result => result.status === 'applied')) window.dispatchEvent(new Event('cuesprig:calendar-imported'));
      const workspace = {
        brands: brands.map(({ id, name }) => ({ id, name })),
        posts: posts.map(({ id, brandId, title, description, date, time, schedules }) =>
          ({ id, brandId, title, description: description ?? '', date, time, schedules: schedules ?? {} })),
      };
      const response = await request('/api/chatgpt-sync', 'PUT', { workspace, results });
      if (!response.ok) throw new Error(`Could not sync calendar to ChatGPT (${response.status}).`);
    }
    const snapshot = sanitizeSnapshot(makeSnapshot(await readWorkspace()));
    const response = await fetch(`${phoneSync.origin}/api/calendar`, {
      method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${phoneSync.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    if (!response.ok) throw new Error(`Calendar sync failed (${response.status}). Check your URL and write key.`);
    status(`Last synced ${new Date(snapshot.updatedAt).toLocaleString()}`);
  });
  queue = run.catch(error => status(error.message));
  return queue;
}

if (globalThis.chrome?.runtime?.id) {
  $('open-phone-sync').hidden = false;
  $('open-phone-sync').addEventListener('click', async () => {
    const { phoneSync } = await chrome.storage.local.get('phoneSync');
    $('sync-origin').value = phoneSync?.origin ?? '';
    $('sync-key').value = phoneSync?.token ?? '';
    $('sync-chatgpt').checked = phoneSync?.chatgpt ?? false;
    $('disconnect-sync').hidden = !phoneSync;
    $('phone-sync').showModal();
  });
  $('close-phone-sync').addEventListener('click', () => $('phone-sync').close());
  $('phone-sync').addEventListener('close', () => { $('sync-key').value = ''; });
  $('phone-sync-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      const url = new URL($('sync-origin').value);
      const token = $('sync-key').value.trim();
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('Enter the HTTPS address of your calendar server without a path.');
      }
      if (!/^[a-zA-Z0-9_-]{32,128}$/.test(token)) throw new Error('Enter the calendar write key from your server setup.');
      const origin = `${url.origin}/*`;
      if (!await chrome.permissions.request({ origins: [origin] })) throw new Error('Allow access to your calendar server to sync.');
      const { phoneSync } = await chrome.storage.local.get('phoneSync');
      await chrome.storage.local.set({ phoneSync: { origin: url.origin, token, chatgpt: $('sync-chatgpt').checked } });
      if (phoneSync && phoneSync.origin !== url.origin) await chrome.permissions.remove({ origins: [`${phoneSync.origin}/*`] });
      $('disconnect-sync').hidden = false;
      status('Syncing…');
      await sync();
    } catch (error) { status(error.message); }
    finally { busy = false; }
  });
  $('disconnect-sync').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    try {
      const { phoneSync } = await chrome.storage.local.get('phoneSync');
      await chrome.storage.local.remove('phoneSync');
      if (phoneSync) await chrome.permissions.remove({ origins: [`${phoneSync.origin}/*`] });
      $('sync-key').value = '';
      $('disconnect-sync').hidden = true;
      status('Disconnected. The server retains its last snapshot.');
    } catch (error) { status(error.message); }
    finally { busy = false; }
  });
  window.addEventListener('cuesprig:schedules-changed', sync);
  let lastOpenedSync = 0;
  async function syncOnOpen() {
    if (document.visibilityState !== 'visible' || Date.now() - lastOpenedSync < 5000) return;
    lastOpenedSync = Date.now();
    const { phoneSync } = await chrome.storage.local.get('phoneSync');
    if (phoneSync?.chatgpt) await sync();
  }
  const checkForImports = () => syncOnOpen().catch(error => status(error.message));
  document.addEventListener('visibilitychange', checkForImports);
  checkForImports();
}
