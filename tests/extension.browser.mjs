import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const extension = fileURLToPath(new URL('../dist/cuesprig', import.meta.url));

test('packaged extension saves a video and records a platform schedule in Chromium', { timeout: 45000 }, async t => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  t.after(() => context.close());
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 10000 });
  const origin = new URL('.', worker.url()).href.slice(0, -1);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/app/index.html`);
  await page.getByRole('button', { name: 'Add a video post' }).click();
  await page.locator('#video-file').setInputFiles({ name: 'fixture.mp4', mimeType: 'video/mp4', buffer: Buffer.from('test video bytes') });
  await page.getByLabel('Title for YouTube').fill('Example clip');
  await page.getByLabel('Description', { exact: true }).fill('Example caption');
  await page.locator('#composer').getByLabel('Date', { exact: true }).fill('2027-01-20');
  await page.locator('#composer').getByLabel('Time', { exact: true }).fill('13:00');
  await page.getByRole('button', { name: 'Save and prepare' }).click();
  const [videoDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download video', exact: true }).click(),
  ]);
  assert.equal(videoDownload.suggestedFilename(), 'fixture.mp4');
  assert.equal(await readFile(await videoDownload.path(), 'utf8'), 'test video bytes');
  await page.getByRole('button', { name: 'Record schedule' }).click();
  await page.getByLabel('Platform', { exact: true }).selectOption('instagram');
  await page.getByRole('button', { name: 'Save schedule record' }).click();
  await page.getByRole('button', { name: /^Example clip,.*Instagram/ }).click();
  await page.getByText('Scheduled (recorded by you) · Instagram', { exact: true }).waitFor();
  for (const [platform, url] of [['YouTube', 'https://studio.youtube.com/'], ['TikTok', 'https://www.tiktok.com/tiktokstudio/upload']]) {
    await context.route(url, route => route.fulfill({ contentType: 'text/html', body: '<h1>Test upload editor</h1>' }));
    const [editor] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: `Prepare for ${platform}` }).click(),
    ]);
    await editor.waitForURL(url);
    await page.waitForFunction(async expected => Object.values(await chrome.storage.session.get())
      .some(record => record.platform === expected), platform.toLowerCase());
  }
  const readHandoffs = () => worker.evaluate(async () => Object.entries(await chrome.storage.session.get())
    .filter(([key]) => key.startsWith('handoff:')).map(([, handoff]) => handoff));
  const handoffs = await readHandoffs();
  assert.deepEqual(handoffs.map(handoff => handoff.platform).sort(), ['tiktok', 'youtube']);
  assert.equal(new Set(handoffs.map(handoff => handoff.id)).size, 1);
  const youtube = context.pages().find(tab => tab.url() === 'https://studio.youtube.com/');
  assert.ok(youtube);
  await youtube.close();
  await page.waitForFunction(async () => {
    const records = Object.values(await chrome.storage.session.get());
    return !records.some(record => record.platform === 'youtube');
  });
  assert.deepEqual((await readHandoffs()).map(handoff => handoff.platform), ['tiktok']);
  await page.reload();
  await page.getByRole('button', { name: 'Next week' }).waitFor();
  const saved = await page.evaluate(async () => {
    const { readWorkspace } = await import('/app/storage.js');
    return (await readWorkspace()).posts.map(({ title, schedules, video }) => ({ title, schedules, size: video.size }));
  });
  assert.deepEqual(saved, [{ title: 'Example clip', schedules: { instagram: { date: '2027-01-20', time: '13:00' } }, size: 16 }]);
  await page.getByRole('button', { name: /^Switch brand/ }).click();
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download backup' }).click(),
  ]);
  await page.evaluate(async () => {
    const { restoreWorkspace } = await import('/app/storage.js');
    await restoreWorkspace({ posts: [], brands: [{ id: 'default', name: 'Empty test workspace' }], activeBrandId: 'default' });
  });
  await page.getByLabel('Choose a backup to restore').setInputFiles(await download.path());
  await page.getByLabel('Replace this calendar with the backup').check();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Restore backup' }).click()]);
  const restored = await page.evaluate(async () => {
    const { readWorkspace } = await import('/app/storage.js');
    const [post] = (await readWorkspace()).posts;
    return { title: post.title, schedules: post.schedules, bytes: await post.video.text() };
  });
  assert.deepEqual(restored, { title: 'Example clip', schedules: saved[0].schedules, bytes: 'test video bytes' });
  const openSchedule = async platform => {
    const calendar = await context.newPage();
    await calendar.goto(`${origin}/app/index.html#${new URLSearchParams({ record: handoffs[0].id, platform })}`);
    const editor = calendar.getByRole('dialog', { name: 'Record schedule' });
    await editor.getByText('Example clip', { exact: true }).waitFor();
    assert.equal(await editor.getByLabel('Platform').inputValue(), platform);
    return editor;
  };
  const [youtubeSchedule, tiktokSchedule] = await Promise.all([openSchedule('youtube'), openSchedule('tiktok')]);
  await Promise.all([
    youtubeSchedule.getByRole('button', { name: 'Save schedule record' }).click(),
    tiktokSchedule.getByRole('button', { name: 'Save schedule record' }).click(),
  ]);
  await Promise.all([youtubeSchedule.waitFor({ state: 'hidden' }), tiktokSchedule.waitFor({ state: 'hidden' })]);
  const destinations = await page.evaluate(async () => {
    const { readWorkspace } = await import('/app/storage.js');
    return Object.keys((await readWorkspace()).posts[0].schedules).sort();
  });
  assert.deepEqual(destinations, ['instagram', 'tiktok', 'youtube']);
  await page.goto(`${origin}/popup.html`);
  await page.getByRole('button', { name: 'Open calendar' }).waitFor();
  assert.deepEqual(errors, []);
});



test('upload helpers attach intact bytes and fill the editor without submitting', { timeout: 30000 }, async t => {
  const browser = await chromium.launch({ channel: 'chromium' });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <form>
      <input type="file" accept="image/*" id="thumbnail">
      <input type="file" accept="video/*" id="video">
      <div id="title-textarea"><div id="textbox" contenteditable="true"></div></div>
      <div id="description-textarea"><div id="textbox" contenteditable="true"></div></div>
      <button>Schedule</button>
    </form>
  `);
  await page.evaluate(() => {
    document.querySelector('form').addEventListener('submit', event => {
      event.preventDefault(); document.body.dataset.submitted = 'yes';
    });
    document.querySelector('#video').addEventListener('change', () => { document.body.dataset.changed = 'yes'; });
  });
  const { initializeVideoTransfer, receiveVideoChunk, finishVideoTransfer, fillTextFields } = await import('../dist/cuesprig/platforms.js');
  assert.equal(await page.evaluate(initializeVideoTransfer), true);
  for (const chunk of ['example ', 'video']) await page.evaluate(receiveVideoChunk, Buffer.from(chunk).toString('base64'));
  await page.evaluate(finishVideoTransfer, { name: 'example.mp4', type: 'video/mp4' });
  assert.deepEqual(await page.locator('#video').evaluate(async input => {
    const file = input.files[0];
    return { name: file.name, type: file.type, bytes: await file.text() };
  }), { name: 'example.mp4', type: 'video/mp4', bytes: 'example video' });
  assert.equal(await page.locator('#thumbnail').evaluate(input => input.files.length), 0);
  assert.deepEqual(await page.evaluate(fillTextFields, { title: 'Example title', description: 'Example description', platform: 'youtube' }), ['title', 'description']);
  assert.equal(await page.locator('#title-textarea').textContent(), 'Example title');
  assert.equal(await page.locator('#description-textarea').textContent(), 'Example description');
  assert.equal(await page.locator('body').getAttribute('data-changed'), 'yes');
  assert.equal(await page.locator('body').getAttribute('data-submitted'), null);
});

test('the extension popup transfers a saved video to its prepared editor tab', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cuesprig-popup-test-'));
  let context;
  try {
    const bundle = join(directory, 'extension');
    await cp(extension, bundle, { recursive: true });
    const manifestPath = join(bundle, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    // A fixture-only grant stands in for clicking Chrome's toolbar action.
    manifest.host_permissions = ['https://studio.youtube.com/*'];
    await writeFile(manifestPath, JSON.stringify(manifest));
    context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${bundle}`, `--load-extension=${bundle}`],
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 10000 });
    const origin = new URL('.', worker.url()).href;
    const editorUrl = 'https://studio.youtube.com/';
    await context.route(editorUrl, route => route.fulfill({
      contentType: 'text/html',
      body: '<input type="file" accept="video/*"><div id="title-textarea"><div id="textbox" contenteditable="true"></div></div>',
    }));
    const editor = await context.newPage();
    await editor.goto(editorUrl);
    const popup = await context.newPage();
    await popup.goto(new URL('app/index.html', origin).href);
    await popup.evaluate(async () => {
      const { storePost } = await import('/app/storage.js');
      await storePost({
        id: 'fixture', brandId: 'default', title: 'Fixture title', description: 'Fixture caption',
        date: '2099-01-01', time: '13:00',
        video: new File([new Uint8Array(300000).fill(42)], 'fixture.mp4', { type: 'video/mp4' }),
      });
    });
    const [tab] = await worker.evaluate(async () => chrome.tabs.query({ url: 'https://studio.youtube.com/*' }));
    assert.ok(tab);
    await worker.evaluate(async id => chrome.storage.session.set({
      [`handoff:${id}`]: { id: 'fixture', platform: 'youtube', tabId: id },
    }), tab.id);
    // The toolbar popup is not a browser tab. Emulate its active-tab query while
    // loading it in a regular test page, and leave scripting and storage intact.
    await popup.addInitScript(activeTab => {
      if (location.pathname === '/popup.html') chrome.tabs.query = async () => [activeTab];
    }, tab);
    await popup.goto(new URL('popup.html', origin).href);
    await popup.getByRole('button', { name: 'Insert video', exact: true }).click({ timeout: 8000 });
    await popup.getByText(/Video handed to the platform/).waitFor({ timeout: 8000 });
    const transferred = await editor.locator('input[type=file]').evaluate(async input => {
      const file = input.files[0];
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { name: file.name, size: bytes.length, intact: bytes.every(byte => byte === 42) };
    });
    assert.deepEqual(transferred, { name: 'fixture.mp4', size: 300000, intact: true });
    await popup.getByRole('button', { name: 'Fill title and description' }).click();
    await popup.getByText(/Filled title/).waitFor();
    assert.equal(await editor.locator('#textbox').textContent(), 'Fixture title');
  } finally {
    await context?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
