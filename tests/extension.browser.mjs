import assert from 'node:assert/strict';
import test from 'node:test';
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
  await page.getByRole('button', { name: 'Add to calendar' }).click();
  await page.getByRole('button', { name: /^Example clip,.*draft/i }).click();
  await page.getByRole('button', { name: 'Record schedule' }).click();
  await page.getByLabel('Platform', { exact: true }).selectOption('instagram');
  await page.getByRole('button', { name: 'Save schedule record' }).click();
  await page.getByRole('button', { name: /^Example clip,.*Instagram/ }).click();
  await page.getByText('Scheduled (recorded by you) · Instagram', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Next week' }).waitFor();
  const saved = await page.evaluate(async () => {
    const { readWorkspace } = await import('/app/storage.js');
    return (await readWorkspace()).posts.map(({ title, schedules, video }) => ({ title, schedules, size: video.size }));
  });
  assert.deepEqual(saved, [{ title: 'Example clip', schedules: { instagram: { date: '2027-01-20', time: '13:00' } }, size: 16 }]);
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
