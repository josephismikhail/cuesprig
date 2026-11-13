const $ = id => document.getElementById(id);
const storageKey = 'cuesprig-phone-calendar';
const names = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' };
let saved;
try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch { saved = null; }
let requestId = 0;

function render(snapshot) {
  const agenda = $('agenda');
  agenda.replaceChildren();
  const current = new Date();
  const today = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
  const entries = snapshot.entries.filter(entry => entry.date >= today)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  let previousDate;
  for (const entry of entries) {
    if (entry.date !== previousDate) {
      const heading = document.createElement('h2');
      heading.textContent = new Date(`${entry.date}T12:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
      agenda.append(heading);
      previousDate = entry.date;
    }
    const row = document.createElement('article');
    const title = document.createElement('h3'); title.textContent = entry.title;
    const detail = document.createElement('p');
    const time = new Date(`${entry.date}T${entry.time}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    detail.textContent = `${time} · ${entry.brand} · ${entry.platforms.map(id => names[id]).join(', ')}`;
    row.append(title, detail); agenda.append(row);
  }
  if (!entries.length) agenda.textContent = 'No upcoming schedules.';
}

function showConnected() {
  $('connect').hidden = true;
  $('refresh').hidden = false;
  $('disconnect').hidden = false;
}

async function refresh(token) {
  const id = ++requestId;
  $('status').textContent = 'Refreshing calendar…';
  try {
    const response = await fetch('/api/calendar', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (response.status === 401) throw new Error('Calendar key was rejected.');
    if (response.status === 404) throw new Error('Send the first calendar snapshot from your laptop.');
    if (!response.ok) throw new Error('Calendar is unavailable.');
    const snapshot = await response.json();
    if (id !== requestId) return;
    saved = { token, snapshot };
    localStorage.setItem(storageKey, JSON.stringify(saved));
    $('token').value = '';
    showConnected(); render(snapshot);
    $('status').textContent = `Last synced ${new Date(snapshot.updatedAt).toLocaleString()}`;
  } catch (error) {
    if (id !== requestId) return;
    $('status').textContent = saved?.snapshot
      ? `${error.message} Showing the calendar saved ${new Date(saved.snapshot.updatedAt).toLocaleString()}.`
      : error.message;
  }
}
$('connect').addEventListener('submit', event => { event.preventDefault(); refresh($('token').value.trim()); });
$('refresh').addEventListener('click', () => refresh(saved.token));
$('disconnect').addEventListener('click', () => {
  requestId++;
  localStorage.removeItem(storageKey);
  saved = null;
  $('agenda').replaceChildren();
  $('status').textContent = '';
  $('connect').hidden = false;
  $('refresh').hidden = true;
  $('disconnect').hidden = true;
});
if (saved?.token && saved.snapshot) { showConnected(); render(saved.snapshot); refresh(saved.token); }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
