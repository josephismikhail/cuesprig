import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const folders = ['public', 'extension', 'scripts', 'phone', 'sync', 'tests'];
const files = ['server.mjs', ...folders.flatMap(folder => readdirSync(new URL(`../${folder}/`, import.meta.url))
  .filter(file => /\.m?js$/.test(file)).map(file => `${folder}/${file}`))];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
