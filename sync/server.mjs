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

export function calendarServer({ readToken, writeToken, filename }) {
  if (![readToken, writeToken].every(token => typeof token === 'string' && /^[a-zA-Z0-9_-]{32,128}$/.test(token)) || readToken === writeToken) {
    throw new Error('Set distinct CUESPRIG_READ_TOKEN and CUESPRIG_WRITE_TOKEN values with at least 32 characters.');
  }
  const headers = {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
  };
  let writes = Promise.resolve();
  return createServer(async (request, response) => {
    const send = (code, body, type = 'application/json') => response.writeHead(code, { ...headers, 'Content-Type': `${type}; charset=utf-8` }).end(body);
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
  calendarServer({
    readToken: process.env.CUESPRIG_READ_TOKEN,
    writeToken: process.env.CUESPRIG_WRITE_TOKEN,
    filename: resolve(process.env.CUESPRIG_SYNC_FILE || '.local/calendar.json'),
  }).listen(Number(process.env.CUESPRIG_SYNC_PORT || 4318), '127.0.0.1', () => console.log('Cuesprig phone calendar is ready on loopback.'));
}
