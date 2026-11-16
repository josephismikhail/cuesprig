const key = 'cuesprig-view-state';
let databasePromise;
let fileKey = sessionStorage.getItem('cuesprig-view-file-key');
if (!fileKey) { fileKey = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''); sessionStorage.setItem('cuesprig-view-file-key', fileKey); }
function database() {
  return databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('cuesprig-view-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function readViewState() {
  try { return JSON.parse(sessionStorage.getItem(key)) ?? null; } catch { return null; }
}
export function saveViewState(state) {
  try { sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* Storage may be unavailable. */ }
}
export async function saveViewFile(file) {
  const db = await database();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite');
    if (file) transaction.objectStore('files').put(file, fileKey);
    else transaction.objectStore('files').delete(fileKey);
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
}
export async function readViewFile() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('files').objectStore('files').get(fileKey);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

