import { createRemoteJWKSet, jwtVerify } from 'jose';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { withSchedule } from '../public/schedules.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const platform = z.enum(['youtube', 'instagram', 'tiktok']);
const title = z.string().trim().min(1).max(100);
const description = z.string().max(5000);
const post = z.object({
  id, brandId: id, title, description, date, time,
  schedules: z.partialRecord(platform, z.object({ date, time })),
});
const workspace = z.object({
  brands: z.array(z.object({ id, name: z.string().trim().min(1).max(40) })).max(1000),
  posts: z.array(post).max(10000),
});
const receipt = z.object({ id, status: z.enum(['applied', 'rejected']), reason: z.string().max(500).optional() });

export function integrationStore(filename) {
  let queue = Promise.resolve();
  const load = async () => {
    try { return JSON.parse(await readFile(filename, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return { workspace: null, changes: [] }; }
  };
  const write = action => {
    const next = queue.then(async () => {
      const data = await load();
      const result = action(data);
      await mkdir(dirname(filename), { recursive: true });
      await writeFile(filename + '.tmp', JSON.stringify(data), { mode: 0o600 });
      await rename(filename + '.tmp', filename);
      return result;
    });
    queue = next.catch(() => {});
    return next;
  };
  return {
    async read() { await queue; return load(); },
    publish(value) {
      const snapshot = workspace.parse(value.workspace);
      const results = z.array(receipt).max(100).parse(value.results);
      return write(data => {
        data.workspace = { ...snapshot, syncedAt: new Date().toISOString() };
        for (const result of results) {
          const change = data.changes.find(item => item.id === result.id && item.status === 'pending');
          if (change) Object.assign(change, result);
        }
        const pending = data.changes.filter(item => item.status === 'pending');
        data.changes = [...data.changes.filter(item => item.status !== 'pending').slice(-200), ...pending];
      });
    },
    enqueue(kind, args) {
      return write(data => {
        if (!data.workspace) throw new Error('Sync the desktop calendar before making changes.');
        if (data.changes.filter(item => item.status === 'pending').length >= 100) throw new Error('Sync the desktop calendar to apply pending changes first.');
        if (kind === 'create' && !data.workspace.brands.some(brand => brand.id === args.brandId)) throw new Error('Unknown brand.');
        if (kind !== 'create' && !data.workspace.posts.some(item => item.id === args.postId)) throw new Error('Unknown video.');
        if (args.date || args.time) {
          const current = data.workspace.posts.find(item => item.id === args.postId);
          withSchedule({}, 'youtube', args.date ?? current?.date, args.time ?? current?.time);
        }
        const change = { ...args, id: randomUUID(), kind, postId: args.postId ?? randomUUID(), status: 'pending' };
        data.changes.push(change);
        return { changeId: change.id, postId: change.postId, status: change.status,
          message: 'Queued. The desktop calendar will apply this change on its next ChatGPT sync.' };
      });
    },
  };
}

export function createMcp(store, scopes) {
  const server = new McpServer({ name: 'Cuesprig', version: '0.1.0' },
    { instructions: 'Cuesprig shows the last synced calendar. Changes are queued until desktop sync. Recording a schedule updates the calendar only.' });
  const register = (name, label, description, inputSchema, scope, handler, destructiveHint = false) => {
    const readOnlyHint = scope === 'calendar:read';
    server.registerTool(name, { title: label, description, inputSchema,
      annotations: { readOnlyHint, destructiveHint, openWorldHint: false, idempotentHint: readOnlyHint },
      _meta: { securitySchemes: [{ type: 'oauth2', scopes: [scope] }] },
    }, async args => {
      if (!scopes.has(scope)) return { isError: true, content: [{ type: 'text', text: 'This connection lacks permission for this action.' }] };
      try {
        const result = await handler(args);
        return { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    });
  };
  register('list_brands', 'List brands', 'List brands available in the last synced workspace.', {}, 'calendar:read', async () => {
    const { workspace } = await store.read();
    return { brands: workspace?.brands ?? [], syncedAt: workspace?.syncedAt ?? null };
  });
  register('list_posts', 'List calendar posts', 'List saved drafts and recorded platform schedules. Dates filter by planned or recorded dates.',
    { brandId: id.optional(), from: date.optional(), through: date.optional(), offset: z.number().int().nonnegative().default(0) },
    'calendar:read', async ({ brandId, from, through, offset }) => {
      const { workspace } = await store.read();
      const posts = (workspace?.posts ?? []).filter(item =>
        (!brandId || item.brandId === brandId) && [item.date, ...Object.values(item.schedules).map(value => value.date)]
          .some(value => (!from || value >= from) && (!through || value <= through)));
      return { posts: posts.slice(offset, offset + 25), nextOffset: posts.length > offset + 25 ? offset + 25 : null, syncedAt: workspace?.syncedAt ?? null };
    });
  register('get_change', 'Check calendar change', 'Check whether a queued change was applied or rejected by the desktop.',
    { changeId: id }, 'calendar:read', async ({ changeId }) => {
      const { changes } = await store.read();
      const change = changes.find(item => item.id === changeId);
      return { status: change?.status ?? 'unknown', reason: change?.reason ?? null };
    });
  register('create_draft', 'Create a draft', 'Queue a new draft without media for the specified brand.',
    { brandId: id, title, description: description.optional(), date, time }, 'calendar:write', args => store.enqueue('create', args));
  register('update_draft', 'Update a draft', 'Queue changes to an unscheduled draft. Existing video attachments stay on the desktop.',
    { postId: id, title: title.optional(), description: description.optional(), date: date.optional(), time: time.optional() },
    'calendar:write', args => store.enqueue('edit', args));
  register('record_schedule', 'Record a confirmed schedule', 'Record a schedule only after the user confirms that the platform accepted it. This does not publish or schedule on the platform.',
    { postId: id, platform, date, time }, 'calendar:write', args => store.enqueue('record', args));
  register('remove_schedule_record', 'Remove a calendar schedule record', 'Remove a recorded schedule from Cuesprig after the user confirms. This does not cancel the platform post.',
    { postId: id, platform }, 'calendar:write', args => store.enqueue('remove', args), true);
  return server;
}

export function oauthAccess({ issuer, audience, jwksUrl, subject }) {
  const keys = createRemoteJWKSet(new URL(jwksUrl));
  return async token => {
    const { payload } = await jwtVerify(token, keys, { issuer, audience, subject, requiredClaims: ['exp', 'sub'] });
    return new Set(typeof payload.scope === 'string' ? payload.scope.split(' ') : []);
  };
}

export async function handleMcp(request, response, store, scopes, body) {
  const server = createMcp(store, scopes);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  response.once('close', () => server.close().catch(() => {}));
  await server.connect(transport);
  await transport.handleRequest(request, response, body);
}
