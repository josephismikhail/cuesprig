import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const root = new URL('../dist/cuesprig/', import.meta.url);

test('extension package has valid entrypoints and local asset references', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root)));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
  assert.equal(manifest.host_permissions, undefined);
  await access(new URL(manifest.background.service_worker, root));
  await access(new URL(manifest.action.default_popup, root));
  const html = await readFile(new URL('app/index.html', root), 'utf8');
  assert.ok(!/(?:src|href)="\//.test(html));
  for (const match of html.matchAll(/(?:src|href)="\.\/([^"?#]+)/g)) {
    await access(new URL(`app/${match[1]}`, root));
  }
});
