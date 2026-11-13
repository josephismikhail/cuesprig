import { withSchedule } from './schedules.js';

const signature = 'CUESPRIG1\n';
const metadataLimit = 32 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function encodeBackup(workspace) {
  const media = [];
  const posts = workspace.posts.map(({ video, ...post }) => {
    if (!video) return post;
    media.push(video);
    return { ...post, media: { name: video.name || 'video.mp4', type: video.type, size: video.size } };
  });
  const metadata = encoder.encode(JSON.stringify({ posts, brands: workspace.brands, activeBrandId: workspace.activeBrandId }));
  if (metadata.length > metadataLimit) throw new Error('This calendar is too large to back up.');
  return new Blob([signature, String(metadata.length).padStart(10, '0'), metadata, ...media], { type: 'application/octet-stream' });
}

function requireValid(condition) {
  if (!condition) throw new Error('This is not a valid Cuesprig backup.');
}

const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);

export async function decodeBackup(file) {
  const prefixLength = signature.length + 10;
  const prefix = decoder.decode(await file.slice(0, prefixLength).arrayBuffer());
  requireValid(prefix.startsWith(signature) && /^\d{10}$/.test(prefix.slice(signature.length)));
  const metadataLength = Number(prefix.slice(signature.length));
  requireValid(metadataLength <= metadataLimit && prefixLength + metadataLength <= file.size);
  let data;
  try { data = JSON.parse(decoder.decode(await file.slice(prefixLength, prefixLength + metadataLength).arrayBuffer())); }
  catch { requireValid(false); }
  requireValid(Array.isArray(data?.brands) && data.brands.length > 0 && Array.isArray(data.posts));
  const brandIds = new Set();
  const brands = data.brands.map(({ id, name, picture }) => {
    requireValid(identifier(id) && !brandIds.has(id) && typeof name === 'string' && name.trim() && name.length <= 40);
    requireValid(picture == null || (typeof picture === 'string' && picture.length <= 7 * 1024 * 1024 &&
      /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(picture)));
    brandIds.add(id);
    return { id, name, picture: picture ?? null };
  });
  requireValid(brandIds.has(data.activeBrandId));
  let offset = prefixLength + metadataLength;
  const postIds = new Set();
  const posts = data.posts.map(({ id, brandId, title, description, date, time, media, schedules }) => {
    requireValid(identifier(id) && !postIds.has(id) && brandIds.has(brandId) && typeof title === 'string' &&
      title.trim() && title.length <= 100 && (description == null || typeof description === 'string'));
    withSchedule({}, 'youtube', date, time);
    postIds.add(id);
    let post = { id, brandId, title, description: description ?? '', date, time };
    if (schedules != null) {
      requireValid(typeof schedules === 'object' && !Array.isArray(schedules));
      for (const [platform, schedule] of Object.entries(schedules)) {
        post = withSchedule(post, platform, schedule?.date, schedule?.time);
      }
    }
    if (media) {
      const { name, type, size } = media;
      requireValid(typeof name === 'string' && name.length <= 255 && typeof type === 'string' &&
        (type === '' || type.startsWith('video/') || /\.(mp4|mov|webm|m4v|ogv|avi|mkv)$/i.test(name)) &&
        Number.isSafeInteger(size) && size > 0 && size <= file.size - offset);
      post.video = new File([file.slice(offset, offset + size)], name, { type });
      offset += size;
    }
    return post;
  });
  requireValid(offset === file.size);
  return { posts, brands, activeBrandId: data.activeBrandId };
}
