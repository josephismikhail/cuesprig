import test from 'node:test';
import assert from 'node:assert/strict';
import { withSchedule, withoutSchedule, calendarEntries } from '../public/schedules.js';

const draft = { id: 'video', brandId: 'brand', title: 'Original title', date: '2026-11-13', time: '12:00' };

test('older drafts stay on their planned date', () => {
  assert.deepEqual(calendarEntries(draft), [{ ...draft, destinations: [] }]);
});

test('equal schedule times share one card and different times get separate entries', () => {
  const youtube = withSchedule(draft, 'youtube', '2026-11-14', '10:00');
  const instagram = withSchedule(youtube, 'instagram', '2026-11-14', '10:00');
  const tiktok = withSchedule(instagram, 'tiktok', '2026-11-14', '11:00');
  assert.deepEqual(calendarEntries(tiktok).map(({ id, time, destinations }) => ({ id, time, destinations })), [
    { id: 'video', time: '10:00', destinations: ['youtube', 'instagram'] },
    { id: 'video', time: '11:00', destinations: ['tiktok'] },
  ]);
  assert.equal(draft.schedules, undefined);
});

test('record replacement and removal affect only the selected platform', () => {
  const first = withSchedule(draft, 'youtube', '2026-11-14', '10:00');
  const second = withSchedule(first, 'tiktok', '2026-11-14', '11:00');
  const replaced = withSchedule(second, 'youtube', '2026-11-14', '09:00');
  assert.equal(replaced.schedules.youtube.time, '09:00');
  const removed = withoutSchedule(replaced, 'youtube');
  assert.deepEqual(Object.keys(removed.schedules), ['tiktok']);
  assert.equal(calendarEntries(withoutSchedule(removed, 'tiktok'))[0].date, draft.date);
});

test('invalid platform keys, calendar dates and times are rejected', () => {
  assert.throws(() => withSchedule(draft, '__proto__', '2026-11-13', '12:00'));
  assert.throws(() => withSchedule(draft, 'youtube', '2026-02-30', '12:00'));
  assert.throws(() => withSchedule(draft, 'youtube', '2026-11-13', '24:00'));
});
