import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSnapshot, sanitizeSnapshot } from '../public/snapshot.js';
import { calendarServer } from '../sync/server.mjs';

const recorded = { title: 'Example', brandId: 'studio', date: '2026-11-12', time: '12:00',
  video: 'private media', description: 'private description',
  schedules: { youtube: { date: '2026-11-13', time: '15:00' } } };
const snapshot = makeSnapshot({ brands: [{ id: 'studio', name: 'Example studio', picture: 'private picture' }],
  posts: [recorded, { ...recorded, schedules: undefined }] });

test('phone snapshot includes confirmed metadata only', () => {
  assert.deepEqual(snapshot.entries, [{ title: 'Example', brand: 'Example studio', date: '2026-11-13', time: '15:00', platforms: ['youtube'] }]);
  assert.deepEqual(sanitizeSnapshot(snapshot), snapshot);
  assert.throws(() => sanitizeSnapshot({ ...snapshot, entries: [{ ...snapshot.entries[0], date: '2026-02-30' }] }));
});

test('phone server separates write and read access, strips private fields, and serves the installable shell', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'cuesprig-sync-'));
  const readToken = 'test-read-' + 'r'.repeat(32);
  const writeToken = 'test-write-' + 'w'.repeat(32);
  const filename = join(directory, 'calendar.json');
  const server = calendarServer({ readToken, writeToken, filename }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = (method, token, payload) => fetch(`${base}/api/calendar`, {
    method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(payload && { 'Content-Type': 'application/json' }) },
    body: payload && JSON.stringify(payload),
  });
  assert.equal((await api('GET')).status, 401);
  assert.equal((await api('GET', readToken)).status, 404);
  assert.equal((await api('PUT', readToken, snapshot)).status, 401);
  assert.equal((await api('GET', writeToken)).status, 401);
  assert.equal((await api('PUT', writeToken, { version: 2 })).status, 400);
  const enriched = { ...snapshot, entries: [{ ...snapshot.entries[0], video: 'private' }] };
  assert.equal((await api('PUT', writeToken, enriched)).status, 204);
  const result = await api('GET', readToken);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await result.json(), snapshot);
  assert.equal((await fetch(`${base}/`)).status, 200);
  const manifest = await (await fetch(`${base}/manifest.webmanifest`)).json();
  assert.equal(manifest.display, 'standalone');
  assert.equal((await fetch(`${base}/sw.js`)).status, 200);
});
