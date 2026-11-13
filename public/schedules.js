export const platforms = Object.freeze({
  youtube: Object.freeze({ name: 'YouTube', url: 'https://studio.youtube.com/', hosts: ['studio.youtube.com'] }),
  instagram: Object.freeze({ name: 'Instagram', url: 'https://www.instagram.com/', hosts: ['www.instagram.com', 'business.facebook.com'] }),
  tiktok: Object.freeze({ name: 'TikTok', url: 'https://www.tiktok.com/tiktokstudio/upload', hosts: ['www.tiktok.com'] }),
});

export function withSchedule(post, platform, date, time) {
  if (!Object.hasOwn(platforms, platform)) throw new Error('Choose a supported platform.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('Enter a valid date and time.');
  }
  const value = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(value.valueOf()) || value.toISOString().slice(0, 10) !== date) throw new Error('Enter a valid date.');
  return { ...post, schedules: { ...post.schedules, [platform]: { date, time } } };
}

export function withoutSchedule(post, platform) {
  const schedules = { ...post.schedules };
  delete schedules[platform];
  return { ...post, schedules };
}

export function calendarEntries(post) {
  const entries = new Map();
  for (const platform of Object.keys(platforms)) {
    const schedule = post.schedules?.[platform];
    if (!schedule) continue;
    const key = `${schedule.date}T${schedule.time}`;
    if (!entries.has(key)) entries.set(key, { ...post, date: schedule.date, time: schedule.time, destinations: [] });
    entries.get(key).destinations.push(platform);
  }
  return entries.size ? [...entries.values()] : [{ ...post, destinations: [] }];
}
