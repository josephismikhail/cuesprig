import { stagedVideos } from './staged-videos.mjs';
import { pipeline } from 'node:stream/promises';
import { integrationStore, oauthAccess, handleMcp } from './chatgpt.mjs';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sanitizeSnapshot } from '../public/snapshot.js';

const assets = new Map(Object.entries({
  '/': ['../phone/index.html', 'text/html'],
  '/phone.js': ['../phone/phone.js', 'text/javascript'],
  '/phone.css': ['../phone/phone.css', 'text/css'],
  '/sw.js': ['../phone/sw.js', 'text/javascript'],
  '/manifest.webmanifest': ['../phone/manifest.webmanifest', 'application/manifest+json'],
  '/icon.svg': ['../public/icon.svg', 'image/svg+xml'],
}));

function authorized(header, token) {
  const supplied = Buffer.from(header ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function jsonBody(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw Object.assign(new Error('Expected JSON.'), { status: 415 });
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw Object.assign(new Error('Request too large.'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

export function calendarServer({ readToken, writeToken, filename, chatgpt }) {
  if (![readToken, writeToken].every(token => typeof token === 'string' && /^[a-zA-Z0-9_-]{32,128}$/.test(token)) || readToken === writeToken) {
    throw new Error('Set distinct CUESPRIG_READ_TOKEN and CUESPRIG_WRITE_TOKEN values with at least 32 characters.');
  }
  const headers = {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
  };
  const videos = chatgpt?.attachmentOrigins?.length
    ? stagedVideos(filename + '.videos', chatgpt.attachmentOrigins, chatgpt.fetchAttachment) : undefined;
  const connector = chatgpt && integrationStore(chatgpt.filename ?? filename + '.chatgpt.json', videos);
  let writes = Promise.resolve();
  return createServer(async (request, response) => {
    const send = (code, body, type = 'application/json') => response.writeHead(code, { ...headers, 'Content-Type': `${type}; charset=utf-8` }).end(body);
    if (connector && request.url === '/.well-known/oauth-protected-resource/mcp') {
      if (request.method !== 'GET') return send(405);
      return send(200, JSON.stringify({ resource: chatgpt.audience, authorization_servers: [chatgpt.issuer],
        scopes_supported: ['calendar:read', 'calendar:write'], bearer_methods_supported: ['header'] }));
    }
    if (connector && request.url === '/mcp') {
      let scopes;
      try {
        const match = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? '');
        if (!match) throw new Error();
        scopes = await chatgpt.authorize(match[1]);
      } catch {
        response.setHeader('WWW-Authenticate', `Bearer resource_metadata="${new URL('/.well-known/oauth-protected-resource/mcp', chatgpt.audience).href}"`);
        return send(401);
      }
      if (request.method !== 'POST') return send(405);
      try { await handleMcp(request, response, connector, scopes, await jsonBody(request)); }
      catch (error) { if (!response.headersSent) send(error.status ?? 400); }
      return;
    }
    const videoId = videos && /^\/api\/chatgpt-video\/([a-f0-9-]{36})$/.exec(request.url)?.[1];
    if (videoId) {
      if (request.method !== 'GET') return send(405);
      if (!authorized(request.headers.authorization, writeToken)) return send(401);
      try {
        const { changes } = await connector.read();
        const media = changes.find(change => change.id === videoId && change.status === 'pending')?.media;
        if (!media || media.expiresAt <= Date.now()) return send(404);
        const info = await videos.stat(videoId);
        if (info.size !== media.size) return send(409);
        response.writeHead(200, { ...headers, 'Content-Type': media.type, 'Content-Length': media.size, 'Content-Disposition': 'attachment' });
        await pipeline(videos.open(videoId), response);
      } catch (error) { if (!response.headersSent) send(error.code === 'ENOENT' ? 404 : 500); }
      return;
    }
    if (connector && request.url === '/api/chatgpt-sync') {
      if (!['GET', 'PUT'].includes(request.method)) return send(405);
      if (!authorized(request.headers.authorization, writeToken)) return send(401);
      try {
        if (request.method === 'GET') {
          const { changes } = await connector.read();
          return send(200, JSON.stringify({ changes: changes.filter(change => change.status === 'pending') }));
        }
        await connector.publish(await jsonBody(request));
        return send(204);
      } catch (error) { return send(error.status ?? (error.code ? 500 : 400)); }
    }
    if (request.url === '/api/calendar') {
      const method = request.method;
      if (method !== 'GET' && method !== 'PUT') return send(405);
      if (!authorized(request.headers.authorization, method === 'GET' ? readToken : writeToken)) return send(401);
      try {
        if (method === 'GET') {
          try { return send(200, await readFile(filename)); }
          catch (error) { if (error.code === 'ENOENT') return send(404); throw error; }
        }
        if (request.headers['content-type'] !== 'application/json') return send(415);
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 1024 * 1024) { send(413); return; }
          chunks.push(chunk);
        }
        let snapshot;
        try { snapshot = sanitizeSnapshot(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { return send(400); }
        const write = writes.then(async () => {
          await mkdir(dirname(filename), { recursive: true });
          await writeFile(`${filename}.tmp`, JSON.stringify(snapshot), { mode: 0o600 });
          await rename(`${filename}.tmp`, filename);
        });
        writes = write.catch(() => {});
        await write;
        return send(204);
      } catch { return send(500); }
    }
    if (request.method !== 'GET') return send(405);
    const asset = assets.get(request.url);
    if (!asset) return send(404);
    try { send(200, await readFile(new URL(asset[0], import.meta.url)), asset[1]); }
    catch { send(500); }
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { CUESPRIG_OAUTH_ISSUER: issuer, CUESPRIG_MCP_URL: audience,
    CUESPRIG_OAUTH_JWKS: jwksUrl, CUESPRIG_OAUTH_SUBJECT: subject } = process.env;
  const enabled = [issuer, audience, jwksUrl, subject].some(Boolean);
  if (enabled && (![issuer, audience, jwksUrl].every(value => value && new URL(value).protocol === 'https:') ||
    !subject || new URL(audience).pathname !== '/mcp')) {
    throw new Error('Set the HTTPS OAuth issuer, MCP URL, JWKS URL, and allowed OAuth subject.');
  }
  calendarServer({
    chatgpt: enabled ? { issuer, audience, attachmentOrigins: (process.env.CUESPRIG_ATTACHMENT_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean), authorize: oauthAccess({ issuer, audience, jwksUrl, subject }) } : undefined,
    readToken: process.env.CUESPRIG_READ_TOKEN,
    writeToken: process.env.CUESPRIG_WRITE_TOKEN,
    filename: resolve(process.env.CUESPRIG_SYNC_FILE || '.local/calendar.json'),
  }).listen(Number(process.env.CUESPRIG_SYNC_PORT || 4318), '127.0.0.1', () => console.log('Cuesprig phone calendar is ready on loopback.'));
}
