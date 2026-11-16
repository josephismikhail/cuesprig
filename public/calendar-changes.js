import { withSchedule, withoutSchedule, platforms } from './schedules.js';

export function applyCalendarChange(post, change, brands) {
  if (change.kind === 'create') {
    if (post) throw new Error('A video with that ID already exists.');
    if (!brands.some(brand => brand.id === change.brandId)) throw new Error('Brand is unavailable on desktop.');
    withSchedule({}, 'youtube', change.date, change.time);
    return { id: change.postId, brandId: change.brandId, title: change.title,
      description: change.description ?? '', date: change.date, time: change.time };
  }
  if (!post) throw new Error('Video is unavailable on desktop.');
  if (change.kind === 'edit') {
    if (Object.keys(post.schedules ?? {}).length) throw new Error('Only unscheduled drafts can be edited from ChatGPT.');
    const { title = post.title, description = post.description, date = post.date, time = post.time } = change;
    withSchedule({}, 'youtube', date, time);
    return { ...post, title, description, date, time };
  }
  if (!Object.hasOwn(platforms, change.platform)) throw new Error('Invalid platform.');
  if (change.kind === 'record') return withSchedule(post, change.platform, change.date, change.time);
  if (change.kind === 'remove') return withoutSchedule(post, change.platform);
  throw new Error('Unsupported calendar change.');
}
