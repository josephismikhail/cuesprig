import { initializeVideoTransfer, receiveVideoChunk, finishVideoTransfer } from './platforms.js';

export async function transferVideo(inject, video, onProgress = () => {}) {
  if (!video?.size) throw new Error('This post has no local video.');
  if (!await inject(initializeVideoTransfer)) {
    throw new Error('Open a single video upload editor, or download the video and select it in the editor.');
  }
  const chunkSize = 256 * 1024;
  try {
    for (let offset = 0; offset < video.size; offset += chunkSize) {
      const bytes = new Uint8Array(await video.slice(offset, offset + chunkSize).arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      await inject(receiveVideoChunk, btoa(binary));
      await onProgress(Math.min(100, Math.round((offset + bytes.length) / video.size * 100)));
    }
    await inject(finishVideoTransfer, { name: video.name || 'video.mp4', type: video.type || 'video/mp4' });
  } catch (error) {
    await inject(() => { delete globalThis.cuesprigUpload; }).catch(() => {});
    throw error;
  }
}
