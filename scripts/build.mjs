import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'dist', 'cuesprig');
await mkdir(destination, { recursive: true });
await cp(path.join(root, 'public'), path.join(destination, 'app'), { recursive: true });
await cp(path.join(root, 'extension'), destination, { recursive: true });
const htmlPath = path.join(destination, 'app', 'index.html');
const html = await readFile(htmlPath, 'utf8');
await writeFile(htmlPath, html.replaceAll('href="/', 'href="./').replaceAll('src="/', 'src="./'));
console.log('Built dist/cuesprig. Load this folder in chrome://extensions.');
