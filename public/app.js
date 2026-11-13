const $ = (id) => document.getElementById(id);
const today = new Date();
let focusDate = new Date(today);
let view = 'week';
let posts = [];
let file = null;
let objectUrl = null;
let editingId = null;
let saving = false;
let toastTimer;
let db;
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localDate = (value) => new Date(`${value}T12:00:00`);
const readableDate = (d) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

function showToast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    // Stable storage ID: preserve drafts created before the Cuesprig rebrand.
    const request = indexedDB.open('frame-local-calendar', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('posts', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readPosts() {
  if (!db) db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('posts').objectStore('posts').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storePost(post) {
  if (!db) db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('posts', 'readwrite');
    transaction.objectStore('posts').put(post);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function postCard(post) {
  const card = document.createElement('button');
  card.className = 'post-card';
  const time = new Date(`${post.date}T${post.time}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  card.setAttribute('aria-label', `Edit ${post.title}, ${time}, local draft`);
  const name = document.createElement('strong'); name.textContent = post.title;
  const detail = document.createElement('small'); detail.textContent = `${time} · Draft`;
  card.append(name, detail);
  card.addEventListener('click', () => openComposer(post.date, post));
  return card;
}

function weekStart(date) {
  const start = new Date(date);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return start;
}

function renderCalendar() {
  $('week-view').hidden = view !== 'week';
  $('month-view').hidden = view !== 'month';
  for (const mode of ['week', 'month']) $('view-' + mode).setAttribute('aria-pressed', String(view === mode));
  $('previous').setAttribute('aria-label', `Previous ${view}`);
  $('next').setAttribute('aria-label', `Next ${view}`);
  if (view === 'week') renderWeek(); else renderMonth();
}

function renderWeek() {
  const first = weekStart(focusDate);
  const last = new Date(first); last.setDate(first.getDate() + 6);
  $('month-title').textContent = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).formatRange(first, last);
  const heading = $('week-heading'); heading.replaceChildren(document.createElement('span'));
  const grid = $('week-grid'); grid.replaceChildren();
  const times = document.createElement('div'); times.className = 'time-labels';
  for (let hour = 0; hour < 24; hour++) {
    const label = document.createElement('span');
    label.textContent = new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' });
    times.append(label);
  }
  grid.append(times);
  for (let i = 0; i < 7; i++) {
    const date = new Date(first); date.setDate(first.getDate() + i);
    const key = dayKey(date);
    const current = key === dayKey(today);
    const head = document.createElement('div'); head.className = 'week-day-heading';
    const label = document.createElement('span'); label.textContent = date.toLocaleDateString(undefined, { weekday: 'short' });
    const number = document.createElement('span'); number.className = 'day-number' + (current ? ' is-today' : ''); number.textContent = date.getDate();
    if (current) number.setAttribute('aria-current', 'date');
    head.append(label, number); heading.append(head);
    const column = document.createElement('div'); column.className = 'week-day' + (current ? ' current-day' : '');
    for (let hour = 0; hour < 24; hour++) {
      const slot = document.createElement('button'); slot.className = 'time-slot';
      const time = `${String(hour).padStart(2, '0')}:00`;
      slot.setAttribute('aria-label', `Add post for ${readableDate(date)} at ${time}`);
      slot.addEventListener('click', () => openComposer(key, null, time));
      column.append(slot);
    }
    const dayPosts = posts.filter(post => post.date === key).sort((a, b) => a.time.localeCompare(b.time));
    // Group overlapping 48-minute cards so every draft stays reachable.
    const groups = [];
    for (const post of dayPosts) {
      const [hours, minutes] = post.time.split(':').map(Number);
      const minute = hours * 60 + minutes;
      let group = groups.at(-1);
      if (!group || minute >= group.end) { group = { end: minute + 48, items: [] }; groups.push(group); }
      group.end = minute + 48; group.items.push({ post, minute });
    }
    for (const group of groups) group.items.forEach(({ post, minute }, index) => {
      const card = postCard(post); card.classList.add('week-post');
      card.style.top = `${Math.min(minute, 1392) / 60 * 60}px`;
      card.style.left = `calc(${index * 100 / group.items.length}% + 3px)`;
      card.style.width = `calc(${100 / group.items.length}% - 6px)`;
      column.append(card);
    });
    grid.append(column);
  }
}

function renderMonth() {
  const month = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
  $('month-title').textContent = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const first = weekStart(month);
  const offset = (month.getDay() + 6) % 7;
  const weeks = Math.ceil((offset + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7);
  const grid = $('calendar-grid'); grid.style.setProperty('--weeks', weeks); grid.replaceChildren();
  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(first); date.setDate(first.getDate() + i);
    const key = dayKey(date);
    const cell = document.createElement('div'); cell.className = 'day-cell' + (date.getMonth() !== month.getMonth() ? ' outside' : '');
    const button = document.createElement('button'); button.className = 'day-head';
    button.setAttribute('aria-label', `Add post for ${readableDate(date)}`);
    const number = document.createElement('span'); number.className = 'day-number' + (key === dayKey(today) ? ' is-today' : ''); number.textContent = date.getDate();
    if (key === dayKey(today)) number.setAttribute('aria-current', 'date');
    button.append(number); button.addEventListener('click', () => openComposer(key)); cell.append(button);
    posts.filter(post => post.date === key).sort((a, b) => a.time.localeCompare(b.time)).forEach(post => cell.append(postCard(post)));
    grid.append(cell);
  }
}

function clearPreview() {
  $('preview-player').pause();
  $('preview-player').removeAttribute('src');
  $('preview-player').load();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

function attachFile(candidate) {
  if (!candidate) return;
  if (!candidate.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v|ogv|avi|mkv)$/i.test(candidate.name)) {
    showError('Choose a video file, such as MP4, MOV, or WEBM.'); return;
  }
  if (!candidate.size) { showError('This video is empty. Please choose another file.'); return; }
  clearPreview(); file = candidate;
  objectUrl = URL.createObjectURL(file);
  $('preview-player').src = objectUrl;
  $('video-preview').hidden = false;
  $('choose-video').hidden = true;
  $('file-name').textContent = file.name;
  const unit = file.size < 1024 * 1024 ? 'KB' : 'MB';
  const size = file.size / (unit === 'KB' ? 1024 : 1024 * 1024);
  $('file-size').textContent = `${size.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit} · Stored on this device`;
  $('form-error').hidden = true;
}

function showError(message) { $('form-error').textContent = message; $('form-error').hidden = false; }
function titleCounter() { $('title-count').textContent = `${$('post-title').value.length} / 100`; }
function openComposer(date = dayKey(today), post = null, time = '17:00') {
  $('post-form').reset(); clearPreview(); file = null;
  editingId = post?.id || null;
  $('composer-title').innerHTML = post ? 'Edit post<span>.</span>' : 'New post<span>.</span>';
  $('save-post').innerHTML = `${post ? 'Save changes' : 'Add to calendar'} <span aria-hidden="true">↗</span>`;
  $('post-title').value = post?.title || '';
  $('post-description').value = post?.description || '';
  $('post-date').value = date;
  $('post-time').value = post?.time || time;
  $('video-preview').hidden = true; $('choose-video').hidden = false;
  $('file-name').textContent = 'One video. Three possibilities.';
  $('file-size').textContent = 'Start with the video. The rest comes together.';
  $('form-error').hidden = true;
  if (post?.video) attachFile(post.video);
  titleCounter();
  $('composer').showModal();
}

$('add-post').addEventListener('click', () => openComposer(dayKey(focusDate)));
$('open-accounts').addEventListener('click', () => $('accounts').showModal());
$('close-accounts').addEventListener('click', () => $('accounts').close());
for (const id of ['close-composer', 'cancel']) $(id).addEventListener('click', () => { if (!saving) $('composer').close(); });
$('composer').addEventListener('cancel', (event) => { if (saving) event.preventDefault(); });
$('composer').addEventListener('close', clearPreview);
function navigate(direction) {
  if (view === 'week') focusDate.setDate(focusDate.getDate() + direction * 7);
  else focusDate = new Date(focusDate.getFullYear(), focusDate.getMonth() + direction, 1);
  renderCalendar();
}
$('previous').addEventListener('click', () => navigate(-1));
$('next').addEventListener('click', () => navigate(1));
$('today').addEventListener('click', () => { focusDate = new Date(today); renderCalendar(); });
for (const mode of ['week', 'month']) $('view-' + mode).addEventListener('click', () => {
  view = mode; renderCalendar();
  if (mode === 'week') $('week-scroll').scrollTop = 8 * 60;
});
$('post-title').addEventListener('input', titleCounter);
for (const id of ['choose-video', 'replace-video']) $(id).addEventListener('click', () => $('video-file').click());
$('video-file').addEventListener('change', () => attachFile($('video-file').files[0]));
$('preview-player').addEventListener('error', () => {
  if (file && objectUrl) $('file-size').textContent = 'Preview unavailable in this browser. The original file can still be saved.';
});
let dragDepth = 0;
const dropZone = $('drop-zone');
dropZone.addEventListener('dragenter', (event) => { event.preventDefault(); dragDepth++; dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
dropZone.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropZone.classList.remove('drag-over'); } });
dropZone.addEventListener('drop', (event) => {
  event.preventDefault(); dragDepth = 0; dropZone.classList.remove('drag-over');
  if (event.dataTransfer.files.length > 1) { showError('Please add one video at a time.'); return; }
  attachFile(event.dataTransfer.files[0]);
});
window.addEventListener('dragover', (event) => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
window.addEventListener('drop', (event) => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
$('post-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving) return;
  if (!file) { showError('Add a video before saving your post.'); return; }
  if (!$('post-title').value.trim()) { showError('Give your video a title.'); $('post-title').focus(); return; }
  saving = true; $('save-post').disabled = true;
  const post = { id: editingId || crypto.randomUUID(), title: $('post-title').value.trim(), description: $('post-description').value, date: $('post-date').value, time: $('post-time').value, video: file };
  try {
    await storePost(post);
    posts = posts.filter((item) => item.id !== post.id).concat(post);
    focusDate = localDate(post.date);
    renderCalendar();
    if (view === 'week') $('week-scroll').scrollTop = Math.max(0, Number(post.time.split(':')[0]) - 2) * 60;
    $('composer').close(); showToast('Draft saved to your calendar.');
  } catch { showError('Could not save this video on your device. Browser storage may be full or unavailable. Your draft is still here.'); }
  finally { saving = false; $('save-post').disabled = false; }
});

renderCalendar();
try { posts = await readPosts(); renderCalendar(); }
catch { showToast('Local storage is unavailable. Drafts cannot be saved yet.'); }

$('week-scroll').scrollTop = 8 * 60;
