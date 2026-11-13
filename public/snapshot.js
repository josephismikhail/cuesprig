import { calendarEntries, platforms } from './schedules.js';

export function makeSnapshot(workspace, now = new Date()) {
  const brands = new Map(workspace.brands.map(brand => [brand.id, brand.name]));
  return {
    version: 1,
    updatedAt: now.toISOString(),
    entries: workspace.posts.flatMap(calendarEntries).filter(entry => entry.destinations.length).map(entry => ({
      title: entry.title,
      brand: brands.get(entry.brandId) ?? 'My brand',
      date: entry.date,
      time: entry.time,
      platforms: entry.destinations,
    })),
  };
}

export function sanitizeSnapshot(value) {
  if (value?.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 10000) throw new Error('Invalid calendar snapshot.');
  if (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('Invalid sync time.');
  const entries = value.entries.map(entry => {
    const { title, brand, date, time, platforms: destinations } = entry ?? {};
    const day = new Date(`${date}T00:00:00Z`);
    if (typeof title !== 'string' || !title.trim() || title.length > 100 || typeof brand !== 'string' || !brand.trim() || brand.length > 40 ||
        typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== date ||
        typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !Array.isArray(destinations) || !destinations.length ||
        destinations.length > 3 || !destinations.every(id => Object.hasOwn(platforms, id))) throw new Error('Invalid calendar entry.');
    return { title, brand, date, time, platforms: [...new Set(destinations)] };
  });
  return { version: 1, updatedAt: new Date(value.updatedAt).toISOString(), entries };
}
