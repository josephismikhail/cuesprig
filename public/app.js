import { readWorkspace, storePost, storeBrand, selectBrand } from './storage.js';

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
let brands = [];
let activeBrandId = null;
let editingBrandId = null;
let brandPicture = null;
let brandBusy = false;
let pictureRequest = 0;
let returnToAccounts = false;
const activeBrand = () => brands.find(brand => brand.id === activeBrandId);
const brandPosts = () => posts.filter(post => post.brandId === activeBrandId);
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localDate = (value) => new Date(`${value}T12:00:00`);
const readableDate = (d) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

function showToast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}

function renderAvatar(element, brand) {
  element.replaceChildren();
  if (brand.picture) {
    const image = document.createElement('img');
    image.src = brand.picture; image.alt = '';
    element.append(image);
  } else {
    element.textContent = brand.name.trim().slice(0, 2).toUpperCase() || '+';
  }
}

function renderBrands() {
  const brand = activeBrand();
  $('active-brand-name').textContent = brand.name;
  $('brand-switcher').setAttribute('aria-label', `Switch brand, current brand: ${brand.name}`);
  $('accounts-brand-name').textContent = brand.name;
  renderAvatar($('active-avatar'), brand);
  renderAvatar($('accounts-avatar'), brand);
  for (const listId of ['brand-list', 'account-brand-list']) {
    $(listId).replaceChildren();
    for (const item of brands) {
    const button = document.createElement('button'); button.className = 'brand-option';
    button.setAttribute('aria-pressed', String(item.id === activeBrandId));
    const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.setAttribute('aria-hidden', 'true');
    renderAvatar(avatar, item);
    const name = document.createElement('span'); name.className = 'brand-option-name'; name.textContent = item.name;
    const check = document.createElement('span'); check.className = 'brand-check'; check.setAttribute('aria-hidden', 'true'); check.textContent = item.id === activeBrandId ? '✓' : '';
    button.append(avatar, name, check);
    button.addEventListener('click', async () => {
      if (brandBusy) return;
      brandBusy = true;
      try {
        await selectBrand(item.id); activeBrandId = item.id;
        renderBrands(); renderCalendar(); $('brand-menu').hidePopover();
        closeBrandOptions();
        if (listId === 'account-brand-list') $('brand-options-toggle').focus();
      } catch { showToast('Could not switch brands. Please try again.'); }
      finally { brandBusy = false; }
    });
      $(listId).append(button);
    }
  }
}

function closeBrandOptions() {
  $('account-brand-menu').hidden = true;
  $('brand-options-toggle').setAttribute('aria-expanded', 'false');
}

$('brand-options-toggle').addEventListener('click', () => {
  const opening = $('account-brand-menu').hidden;
  $('account-brand-menu').hidden = !opening;
  $('brand-options-toggle').setAttribute('aria-expanded', String(opening));
  $('account-brand-actions').hidden = false;
  $('account-brand-picker').hidden = true;
  if (opening) $('switch-brand-from-accounts').focus();
});
$('switch-brand-from-accounts').addEventListener('click', () => {
  $('account-brand-actions').hidden = true;
  $('account-brand-picker').hidden = false;
  $('account-brand-list').querySelector('button')?.focus();
});
document.addEventListener('click', event => {
  if (!$('account-brand-options').contains(event.target)) closeBrandOptions();
});
$('accounts').addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('account-brand-menu').hidden) {
    event.preventDefault(); event.stopPropagation(); closeBrandOptions(); $('brand-options-toggle').focus();
  }
});
$('accounts').addEventListener('close', closeBrandOptions);

function openBrandEditor(brand = null, fromAccounts = false) {
  if (brandBusy) return;
  if ($('brand-menu').matches(':popover-open')) $('brand-menu').hidePopover();
  returnToAccounts = fromAccounts;
  if (fromAccounts) $('accounts').close();
  editingBrandId = brand?.id || null;
  brandPicture = brand?.picture || null;
  $('brand-form').reset();
  $('save-brand').disabled = false;
  $('brand-name').value = brand?.name || '';
  $('brand-editor-title').textContent = brand ? 'Edit brand' : 'New brand';
  $('save-brand').textContent = brand ? 'Save brand' : 'Create brand';
  $('brand-error').hidden = true;
  updatePicturePreview();
  $('brand-editor').showModal();
  $('brand-name').focus();
}

function updatePicturePreview() {
  renderAvatar($('brand-picture-preview'), { name: $('brand-name').value, picture: brandPicture });
  $('remove-brand-picture').hidden = !brandPicture;
}

function brandError(message) { $('brand-error').textContent = message; $('brand-error').hidden = false; }

$('edit-active-brand').addEventListener('click', () => openBrandEditor(activeBrand()));
$('add-brand').addEventListener('click', () => openBrandEditor());
$('edit-brand-from-accounts').addEventListener('click', () => openBrandEditor(activeBrand(), true));
$('brand-name').addEventListener('input', updatePicturePreview);
for (const id of ['close-brand-editor', 'cancel-brand-editor']) $(id).addEventListener('click', () => {
  if (!brandBusy) $('brand-editor').close();
});
$('brand-editor').addEventListener('cancel', event => { if (brandBusy) event.preventDefault(); });
$('brand-editor').addEventListener('close', () => {
  pictureRequest++;
  if (returnToAccounts) { returnToAccounts = false; $('accounts').showModal(); }
});
$('upload-brand-picture').addEventListener('click', () => $('brand-picture-file').click());
$('remove-brand-picture').addEventListener('click', () => {
  pictureRequest++; brandPicture = null; $('brand-picture-file').value = ''; $('save-brand').disabled = false; updatePicturePreview();
});
$('brand-picture-file').addEventListener('change', async () => {
  const candidate = $('brand-picture-file').files[0];
  if (!candidate) return;
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(candidate.type)) {
    brandError('Choose a PNG, JPG, WebP, or GIF image.'); return;
  }
  if (candidate.size > 5 * 1024 * 1024) { brandError('Choose an image smaller than 5 MB.'); return; }
  const request = ++pictureRequest;
  $('save-brand').disabled = true;
  try {
    const picture = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(candidate);
    });
    const image = new Image(); image.src = picture; await image.decode();
    if (request !== pictureRequest) return;
    brandPicture = picture; updatePicturePreview(); $('brand-error').hidden = true;
  } catch { if (request === pictureRequest) brandError('This image could not be opened. Choose another picture.'); }
  finally { if (request === pictureRequest) $('save-brand').disabled = false; }
});
$('brand-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (brandBusy || $('save-brand').disabled) return;
  const name = $('brand-name').value.trim();
  if (!name) { brandError('Give your brand a name.'); $('brand-name').focus(); return; }
  if (brands.some(brand => brand.id !== editingBrandId && brand.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    brandError('A brand with this name already exists. Choose another name.'); return;
  }
  const brand = { id: editingBrandId || crypto.randomUUID(), name, picture: brandPicture };
  brandBusy = true; $('save-brand').disabled = true;
  try {
    await storeBrand(brand);
    brands = brands.filter(item => item.id !== brand.id).concat(brand);
    activeBrandId = brand.id;
    renderBrands(); renderCalendar(); $('brand-editor').close();
  } catch { brandError('Could not save this brand on your device. Please try again.'); }
  finally { brandBusy = false; $('save-brand').disabled = false; }
});

const postTime = post => new Date(`${post.date}T${post.time}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const postTitle = post => post.title || 'Untitled video';
function postCard(post) {
  const card = document.createElement('button'); card.className = 'post-card';
  card.setAttribute('aria-label', `${postTitle(post)}, ${postTime(post)}, draft`);
  card.title = postTitle(post);
  const name = document.createElement('strong'); name.textContent = postTitle(post);
  const detail = document.createElement('small'); detail.textContent = `${postTime(post)} · Draft`;
  card.append(name, detail);
  card.addEventListener('click', () => openDayPosts(post.date, post.id));
  return card;
}

function openDayPosts(date, selectedId = null) {
  $('day-posts-title').textContent = readableDate(localDate(date));
  const list = $('day-posts-list'); list.replaceChildren();
  const items = brandPosts().filter(post => post.date === date).sort((a,b) => a.time.localeCompare(b.time));
  $('day-posts-count').textContent = `${items.length} ${items.length === 1 ? 'video' : 'videos'} · ${activeBrand().name}`;
  for (const post of items) {
    const row = document.createElement('article'); row.className = 'day-post-row' + (post.id === selectedId ? ' selected-post' : '');
    const time = document.createElement('time'); time.textContent = postTime(post);
    const content = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = postTitle(post);
    const status = document.createElement('p'); status.textContent = 'Draft · Not scheduled on any platform';
    content.append(title, status);
    if (post.description) { const description = document.createElement('p'); description.className = 'post-description'; description.textContent = post.description; content.append(description); }
    const edit = document.createElement('button'); edit.className = 'today-button'; edit.textContent = 'Edit';
    edit.addEventListener('click', () => { $('day-posts').close(); openComposer(date, post); });
    row.append(time, content, edit); list.append(row);
  }
  if (!items.length) list.textContent = 'No posts planned for this day.';
  $('day-posts').showModal();
  if (selectedId) list.querySelector('.selected-post')?.scrollIntoView({block:'nearest'});
}
$('close-day-posts').addEventListener('click', () => $('day-posts').close());

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
    const dayPosts = brandPosts().filter(post => post.date === key).sort((a, b) => a.time.localeCompare(b.time));
    // Group overlapping 48-minute cards so every draft stays reachable.
    const groups = [];
    for (const post of dayPosts) {
      const [hours, minutes] = post.time.split(':').map(Number);
      const minute = hours * 60 + minutes;
      let group = groups.at(-1);
      if (!group || minute >= group.end) { group = { end: minute + 48, items: [] }; groups.push(group); }
      group.end = minute + 48; group.items.push({ post, minute });
    }
    for (const group of groups) {
      const { post, minute } = group.items[0];
      let card;
      if (group.items.length === 1) card = postCard(post);
      else {
        card = document.createElement('button'); card.className = 'post-card';
        const title = document.createElement('strong'); title.textContent = `${group.items.length} videos`;
        const detail = document.createElement('small'); detail.textContent = `${postTime(post)} · View posts`;
        card.append(title, detail);
        card.setAttribute('aria-label', `${group.items.length} videos from ${postTime(post)}. View posts for ${readableDate(date)}`);
        card.addEventListener('click', () => openDayPosts(key));
      }
      card.classList.add('week-post'); card.style.top = `${Math.min(minute, 1392)}px`;
      card.style.left = '3px'; card.style.width = 'calc(100% - 6px)';
      column.append(card);
    }
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
    const items = brandPosts().filter(post => post.date === key).sort((a,b) => a.time.localeCompare(b.time));
    items.slice(0, 2).forEach(post => cell.append(postCard(post)));
    if (items.length > 2) {
      const more = document.createElement('button'); more.className = 'more-posts'; more.textContent = `+${items.length - 2} more`;
      more.setAttribute('aria-label', `View all ${items.length} videos for ${readableDate(date)}`);
      more.addEventListener('click', () => openDayPosts(key)); cell.append(more);
    }
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
  if (!activeBrandId) { showToast('Your workspace is still loading.'); return; }
  $('composer-brand').textContent = activeBrand().name;
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
  const post = { id: editingId || crypto.randomUUID(), brandId: activeBrandId, title: $('post-title').value.trim(), description: $('post-description').value, date: $('post-date').value, time: $('post-time').value, video: file };
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
try {
  const workspace = await readWorkspace();
  posts = workspace.posts; brands = workspace.brands; activeBrandId = workspace.activeBrandId;
  renderBrands(); renderCalendar();
  $('open-accounts').disabled = false; $('brand-switcher').disabled = false;
} catch (error) { showToast(error.message || 'Local storage is unavailable. Reload to try again.'); }
$('week-scroll').scrollTop = 8 * 60;
