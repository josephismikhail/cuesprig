import { applyCalendarChange } from './calendar-changes.js';

let databasePromise;

function database() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    let blocked = false;
    // Keep the original database name so earlier drafts survive the upgrade.
    const request = indexedDB.open('frame-local-calendar', 3);
    request.onupgradeneeded = event => {
      const db = request.result;
      db.createObjectStore('calendarReceipts', { keyPath: 'id' });
      if (event.oldVersion >= 2) return;
      if (!db.objectStoreNames.contains('posts')) db.createObjectStore('posts', { keyPath: 'id' });
      const brands = db.createObjectStore('brands', { keyPath: 'id' });
      brands.put({ id: 'default', name: 'My brand', picture: null });
      db.createObjectStore('settings', { keyPath: 'id' }).put({ id: 'activeBrand', value: 'default' });
      const cursor = request.transaction.objectStore('posts').openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (!item) return;
        if (!item.value.brandId) item.update({ ...item.value, brandId: 'default' });
        item.continue();
      };
    };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => { request.result.close(); databasePromise = null; };
      resolve(request.result);
    };
    request.onerror = () => { databasePromise = null; reject(request.error); };
    request.onblocked = () => {
      blocked = true;
      databasePromise = null;
      reject(new Error('Close other calendar tabs and reload to finish updating local storage.'));
    };
  });
  return databasePromise;
}

export async function readWorkspace() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['posts', 'brands', 'settings']);
    const posts = transaction.objectStore('posts').getAll();
    const brands = transaction.objectStore('brands').getAll();
    const setting = transaction.objectStore('settings').get('activeBrand');
    transaction.oncomplete = () => resolve({ posts: posts.result, brands: brands.result, activeBrandId: setting.result.value });
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function write(stores, update) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, 'readwrite');
    update(transaction);
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

export const storePost = post => write(['posts'], transaction => transaction.objectStore('posts').put(post));
export async function updatePost(id, update) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('posts', 'readwrite');
    const store = transaction.objectStore('posts');
    const request = store.get(id);
    let updated;
    let failure;
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error('This video is no longer in your calendar.');
        updated = update(request.result);
        store.put(updated);
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(updated);
    transaction.onabort = () => reject(failure ?? transaction.error);
  });
}

export const selectBrand = id => write(['settings'], transaction => transaction.objectStore('settings').put({ id: 'activeBrand', value: id }));
export const storeBrand = brand => write(['brands', 'settings'], transaction => {
  transaction.objectStore('brands').put(brand);
  transaction.objectStore('settings').put({ id: 'activeBrand', value: brand.id });
});

export const restoreWorkspace = workspace => write(['posts', 'brands', 'settings'], transaction => {
  for (const store of ['posts', 'brands']) {
    const objectStore = transaction.objectStore(store);
    objectStore.clear();
    for (const record of workspace[store]) objectStore.put(record);
  }
  transaction.objectStore('settings').put({ id: 'activeBrand', value: workspace.activeBrandId });
});

export async function applyRemoteChanges(changes, serverOrigin) {
  const results = [];
  for (const change of changes) {
    const db = await database();
    const result = await new Promise((resolve, reject) => {
      const transaction = db.transaction(['posts', 'brands', 'calendarReceipts'], 'readwrite');
      const posts = transaction.objectStore('posts');
      const receipts = transaction.objectStore('calendarReceipts');
      const key = `${serverOrigin}/${change.id}`;
      const prior = receipts.get(key);
      const post = posts.get(change.postId);
      const brands = transaction.objectStore('brands').getAll();
      let outcome;
      brands.onsuccess = () => {
        if (prior.result) { outcome = prior.result.outcome; return; }
        try {
          const updated = applyCalendarChange(post.result, change, brands.result);
          posts.put(updated);
          outcome = { id: change.id, status: 'applied' };
        } catch (error) {
          outcome = { id: change.id, status: 'rejected', reason: error.message };
        }
        receipts.put({ id: key, outcome });
      };
      transaction.oncomplete = () => resolve(outcome);
      transaction.onabort = () => reject(transaction.error);
    });
    results.push(result);
  }
  return results;
}
