import { readWorkspace } from './storage.js';
import { makeSnapshot, sanitizeSnapshot } from './snapshot.js';

const $ = id => document.getElementById(id);
let queue = Promise.resolve();
let busy = false;
const status = message => { $('sync-status').textContent = message; };

function sync() {
  const run = queue.then(async () => {
    const { phoneSync } = await chrome.storage.local.get('phoneSync');
    if (!phoneSync) return;
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
      await chrome.storage.local.set({ phoneSync: { origin: url.origin, token } });
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
}
