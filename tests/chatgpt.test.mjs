import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { oauthAccess } from '../sync/chatgpt.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { calendarServer } from '../sync/server.mjs';
import { applyCalendarChange } from '../public/calendar-changes.js';

test('MCP reads synced records, enforces write scope and acknowledges desktop changes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'cuesprig-mcp-'));
  const readToken = 'r'.repeat(32), writeToken = 'w'.repeat(32);
  const audience = 'https://calendar.example.com/mcp';
  const server = calendarServer({ readToken, writeToken, filename: join(directory, 'calendar.json'), chatgpt: {
    audience, issuer: 'https://identity.example.com',
    authorize(token) {
      if (token === 'read') return new Set(['calendar:read']);
      if (token === 'write') return new Set(['calendar:read', 'calendar:write']);
      throw new Error('Invalid test token.');
    },
  } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  t.after(async () => {
    await Promise.all(clients.map(client => client.close()));
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  async function connect(token) {
    const client = new Client({ name: 'test', version: '1.0.0' });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', base), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }));
    return client;
  }
  const sync = (method, token, payload) => fetch(base + '/api/chatgpt-sync', { method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const response = await fetch(base + '/mcp', { method: 'POST' });
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate'), /oauth-protected-resource/);
  assert.equal((await sync('GET', readToken)).status, 401);
  assert.equal((await sync('GET', 'write')).status, 401);
  const workspace = { brands: [{ id: 'brand', name: 'Studio' }], posts: [] };
  assert.equal((await sync('PUT', writeToken, { workspace, results: [] })).status, 204);
  const reader = await connect('read');
  const writer = await connect('write');
  const { tools } = await writer.listTools();
  assert.equal(tools.find(tool => tool.name === 'create_draft').annotations.readOnlyHint, false);
  const args = { brandId: 'brand', title: 'Example', date: '2027-01-20', time: '13:00' };
  assert.equal((await reader.callTool({ name: 'create_draft', arguments: args })).isError, true);
  assert.equal((await writer.callTool({ name: 'create_draft', arguments: { ...args, date: '2027-02-30' } })).isError, true);
  const created = await writer.callTool({ name: 'create_draft', arguments: args });
  assert.equal(created.structuredContent.status, 'pending');
  const pending = await (await sync('GET', writeToken)).json();
  assert.equal(pending.changes.length, 1);
  const [change] = pending.changes;
  const local = applyCalendarChange(undefined, change, workspace.brands);
  workspace.posts.push({ ...local, schedules: {}, video: 'must be stripped' });
  assert.equal((await sync('PUT', writeToken, { workspace, results: [{ id: change.id, status: 'applied' }] })).status, 204);
  const result = await reader.callTool({ name: 'list_posts', arguments: { brandId: 'brand' } });
  assert.equal(result.structuredContent.posts[0].title, 'Example');
  assert.equal(result.structuredContent.posts[0].video, undefined);
  assert.equal((await reader.callTool({ name: 'get_change', arguments: { changeId: change.id } })).structuredContent.status, 'applied');
  for (const [name, args] of [
    ['update_draft', { title: 'New title' }],
    ['record_schedule', { platform: 'youtube', date: '2027-01-20', time: '13:00' }],
    ['remove_schedule_record', { platform: 'youtube' }],
  ]) {
    const result = await writer.callTool({ name, arguments: { ...args, postId: local.id } });
    assert.equal(result.structuredContent.status, 'pending', name);
  }
  const edits = (await (await sync('GET', writeToken)).json()).changes;
  const updated = edits.reduce((post, edit) => applyCalendarChange(post, edit, workspace.brands), { ...local, video: 'local' });
  assert.equal(updated.title, 'New title');
  assert.equal(updated.video, 'local');
  assert.deepEqual(updated.schedules, {});
});


test('OAuth verification rejects other users, audiences, expired tokens, and missing scopes', async t => {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test' };
  const keys = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }));
  }).listen(0, '127.0.0.1');
  await once(keys, 'listening');
  t.after(() => new Promise(resolve => keys.close(resolve)));
  const issuer = 'https://identity.example.com', audience = 'https://calendar.example.com/mcp';
  const authorize = oauthAccess({ issuer, audience, subject: 'owner', jwksUrl: `http://127.0.0.1:${keys.address().port}` });
  const token = ({ sub = 'owner', aud = audience, exp = '5m', scope = 'calendar:read calendar:write' } = {}) =>
    new SignJWT({ scope }).setProtectedHeader({ alg: 'ES256', kid: 'test' })
      .setIssuer(issuer).setSubject(sub).setAudience(aud).setExpirationTime(exp).sign(privateKey);
  assert.deepEqual([...await authorize(await token())], ['calendar:read', 'calendar:write']);
  assert.equal((await authorize(await token({ scope: '' }))).has('calendar:write'), false);
  await assert.rejects(authorize(await token({ sub: 'someone-else' })));
  await assert.rejects(authorize(await token({ aud: 'https://other.example.com/mcp' })));
  await assert.rejects(authorize(await token({ exp: '1m ago' })));
});
