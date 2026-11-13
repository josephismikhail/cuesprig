const $ = (id) => document.getElementById(id);
const today = new Date();
let month = new Date(today.getFullYear(), today.getMonth(), 1);
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

function renderCalendar() {
  const title = $('month-title');
  title.replaceChildren(document.createTextNode(month.toLocaleDateString(undefined, { month: 'long' })));
  const year = document.createElement('span');
  year.textContent = month.getFullYear();
  title.append(document.createTextNode(' '), year);
  const first = new Date(month);
  const offset = (first.getDay() + 6) % 7;
  first.setDate(1 - offset);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const total = weeks * 7;
  const grid = $('calendar-grid');
  grid.style.setProperty('--weeks', weeks);
  grid.replaceChildren();
  for (let i = 0; i < total; i++) {
    const date = new Date(first);
    date.setDate(first.getDate() + i);
    const key = dayKey(date);
    const current = key === dayKey(today);
    const cell = document.createElement('div');
    cell.className = `day-cell${date.getMonth() !== month.getMonth() ? ' outside' : ''}${i % 7 >= 5 ? ' weekend' : ''}${i >= total - 7 ? ' last-row' : ''}`;
    const button = document.createElement('button');
    button.className = 'day-head';
    button.setAttribute('aria-label', `Add post for ${readableDate(date)}`);
    const number = document.createElement('span');
    number.className = `day-number${current ? ' is-today' : ''}`;
    number.textContent = date.getDate();
    if (current) number.setAttribute('aria-current', 'date');
    button.append(number);
    if (current) { const label = document.createElement('span'); label.className = 'today-label'; label.textContent = 'TODAY'; button.append(label); }
    const plus = document.createElement('span');
    plus.className = 'day-add'; plus.textContent = '+'; plus.setAttribute('aria-hidden', 'true'); button.append(plus);
    button.addEventListener('click', () => openComposer(key));
    cell.append(button);
    posts.filter((post) => post.date === key).sort((a, b) => a.time.localeCompare(b.time)).forEach((post) => {
      const card = document.createElement('button');
      card.className = 'post-card';
      const time = new Date(`${post.date}T${post.time}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      card.setAttribute('aria-label', `Edit ${post.title}, ${time}, local draft`);
      const play = document.createElement('span'); play.className = 'card-play'; play.textContent = '▶';
      const info = document.createElement('span'); info.className = 'card-info';
      const name = document.createElement('strong'); name.textContent = post.title;
      const detail = document.createElement('small'); detail.textContent = `${time} · Draft`;
      info.append(name, detail); card.append(play, info);
      card.addEventListener('click', () => openComposer(post.date, post));
      cell.append(card);
    });
    grid.append(cell);
  }
  const count = posts.filter((post) => { const d = localDate(post.date); return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth(); }).length;
  $('draft-count').textContent = `${count} ${count === 1 ? 'draft' : 'drafts'} this month`;
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
function openComposer(date = dayKey(today), post = null) {
  $('post-form').reset(); clearPreview(); file = null;
  editingId = post?.id || null;
  $('composer-title').innerHTML = post ? 'Edit post<span>.</span>' : 'New post<span>.</span>';
  $('save-post').innerHTML = `${post ? 'Save changes' : 'Add to calendar'} <span aria-hidden="true">↗</span>`;
  $('post-title').value = post?.title || '';
  $('post-description').value = post?.description || '';
  $('post-date').value = date;
  $('post-time').value = post?.time || '17:00';
  $('video-preview').hidden = true; $('choose-video').hidden = false;
  $('file-name').textContent = 'One video. Three possibilities.';
  $('file-size').textContent = 'Start with the video. The rest comes together.';
  $('form-error').hidden = true;
  if (post?.video) attachFile(post.video);
  titleCounter();
  $('composer').showModal();
}

$('add-post').addEventListener('click', () => openComposer(month.getMonth() === today.getMonth() && month.getFullYear() === today.getFullYear() ? dayKey(today) : dayKey(month)));
for (const id of ['close-composer', 'cancel']) $(id).addEventListener('click', () => { if (!saving) $('composer').close(); });
$('composer').addEventListener('cancel', (event) => { if (saving) event.preventDefault(); });
$('composer').addEventListener('close', clearPreview);
$('previous').addEventListener('click', () => { month.setMonth(month.getMonth() - 1); renderCalendar(); });
$('next').addEventListener('click', () => { month.setMonth(month.getMonth() + 1); renderCalendar(); });
$('today').addEventListener('click', () => { month = new Date(today.getFullYear(), today.getMonth(), 1); renderCalendar(); });
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
    const selected = localDate(post.date); month = new Date(selected.getFullYear(), selected.getMonth(), 1);
    renderCalendar(); $('composer').close(); showToast('Draft saved to your calendar.');
  } catch { showError('Could not save this video on your device. Browser storage may be full or unavailable. Your draft is still here.'); }
  finally { saving = false; $('save-post').disabled = false; }
});
$('timezone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ');
renderCalendar();
try { posts = await readPosts(); renderCalendar(); }
catch { showToast('Local storage is unavailable. Drafts cannot be saved yet.'); }
