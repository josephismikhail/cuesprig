import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { calendarServer } from '../sync/server.mjs';

test('phone calendar displays a saved schedule offline and can forget it', { timeout: 30000 }, async t => {
  const folder = await mkdtemp(join(tmpdir(), 'cuesprig-phone-browser-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const readToken = 'read_' + 'r'.repeat(32);
  const writeToken = 'write_' + 'w'.repeat(32);
  const server = calendarServer({ readToken, writeToken, filename: join(folder, 'calendar.json') }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${url}/api/calendar`, {
    method: 'PUT', headers: { Authorization: `Bearer ${writeToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries: [
      { title: 'Example clip', brand: 'Example studio', date: '2099-01-01', time: '13:00', platforms: ['youtube'] },
    ] }),
  });
  assert.equal(response.status, 204);

  const browser = await chromium.launch({ channel: 'chromium' });
  try {
    const context = await browser.newContext({ viewport: { width: 412, height: 880 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.goto(url);
    await page.getByLabel('Calendar read key').fill('x'.repeat(32));
    await page.getByRole('button', { name: 'Open calendar' }).click();
    await page.getByText('Calendar key was rejected.').waitFor();
    await page.getByLabel('Calendar read key').fill(readToken);
    await page.getByRole('button', { name: 'Open calendar' }).click();
    await page.getByRole('heading', { name: 'Example clip' }).waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('heading', { name: 'Example clip' }).waitFor();
    await page.getByText(/Showing the calendar saved/).waitFor();
    await page.getByRole('button', { name: 'Forget this calendar' }).click();
    await page.getByLabel('Calendar read key').waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Example clip' }).count(), 0);
    await page.reload();
    await page.getByLabel('Calendar read key').waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Example clip' }).count(), 0);
  } finally {
    await browser.close();
  }
});
