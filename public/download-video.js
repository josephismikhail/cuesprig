export function downloadVideo(video) {
  const url = URL.createObjectURL(video);
  const link = document.createElement('a');
  link.href = url;
  link.download = video.name || 'video.mp4';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
