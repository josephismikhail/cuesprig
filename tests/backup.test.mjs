import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBackup, decodeBackup } from '../public/backup.js';

const workspace = {
  activeBrandId: 'example',
  brands: [{ id: 'example', name: 'Example studio', picture: null }],
  posts: [{ id: 'video', brandId: 'example', title: 'Example title', description: 'Example caption',
    date: '2027-01-20', time: '13:00', video: new File(['video bytes'], 'example.mp4', { type: 'video/mp4' }),
    schedules: { youtube: { date: '2027-01-21', time: '09:00' } } }],
};

test('backup round-trips the workspace and original video bytes', async () => {
  const result = await decodeBackup(encodeBackup(workspace));
  const [{ video, ...rest }] = result.posts;
  const [{ video: original, ...expected }] = workspace.posts;
  assert.deepEqual(rest, expected);
  assert.deepEqual(result.brands, workspace.brands);
  assert.equal(result.activeBrandId, workspace.activeBrandId);
  assert.equal(video.name, original.name);
  assert.equal(video.type, original.type);
  assert.equal(await video.text(), await original.text());
});

test('truncated backups and invalid workspace references are rejected', async () => {
  const file = encodeBackup(workspace);
  await assert.rejects(decodeBackup(file.slice(0, -1)));
  await assert.rejects(decodeBackup(new Blob([file, 'extra'])));
  await assert.rejects(decodeBackup(encodeBackup({ ...workspace, activeBrandId: 'missing' })));
  await assert.rejects(decodeBackup(encodeBackup({ ...workspace, posts: [...workspace.posts, ...workspace.posts] })));
});
