import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const maxVideoBytes = 100 * 1024 * 1024;
const lifetime = 24 * 60 * 60 * 1000;
const mime = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm' };

export function stagedVideos(directory, allowedOrigins, fetchFile = fetch) {
  const origins = new Set(allowedOrigins.map(value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) {
      throw new Error('Configure exact HTTPS attachment origins.');
    }
    return url.origin;
  }));
  const filename = id => join(directory, id + '.video');
  const remove = id => unlink(filename(id)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  let busy = false;
  return {
    async save(id, file) {
      const url = new URL(file.download_url);
      if (url.username || url.password || !origins.has(url.origin)) throw new Error('Attachment origin is not allowed.');
      if (busy) throw new Error('Another video is being imported. Try again when it finishes.');
      busy = true;
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        let total = 0;
        for (const entry of await readdir(directory)) {
          if (!/^[a-f0-9-]{36}\.video$/.test(entry)) continue;
          const info = await stat(join(directory, entry));
          if (Date.now() - info.mtimeMs >= lifetime) await unlink(join(directory, entry));
          else total += info.size;
        }
        const remaining = Math.min(maxVideoBytes, 2 * maxVideoBytes - total);
        if (remaining <= 0) throw new Error('Video inbox is full. Open Cuesprig to import queued videos.');
        const signal = AbortSignal.timeout(90000);
        const response = await fetchFile(url, { redirect: 'error', signal });
        const declared = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        const type = declared === 'application/octet-stream' ? file.mime_type : declared;
        if (!response.ok || !response.body || !Object.hasOwn(mime, type) || Number(response.headers.get('content-length')) > remaining) {
          await response.body?.cancel();
          throw new Error('Use an MP4, MOV, or WebM video within the 100 MB import limit.');
        }
        let size = 0;
        await pipeline(Readable.fromWeb(response.body), new Transform({
          transform(chunk, encoding, callback) {
            size += chunk.length;
            callback(size > remaining ? new Error('Video exceeds the available import limit.') : null, chunk);
          },
        }), createWriteStream(filename(id), { flags: 'wx', mode: 0o600 }), { signal });
        if (!size) throw new Error('The video is empty.');
        const name = file.file_name?.split(/[\\/]/).at(-1)?.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 180) || 'clip' + mime[type];
        return { name, type, size, expiresAt: Date.now() + lifetime };
      } catch (error) {
        await remove(id);
        throw error;
      } finally { busy = false; }
    },
    remove,
    open: id => createReadStream(filename(id)),
    stat: id => stat(filename(id)),
  };
}
