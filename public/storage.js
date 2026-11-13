let databasePromise;

function database() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    let blocked = false;
    // Keep the original database name so earlier drafts survive the upgrade.
    const request = indexedDB.open('frame-local-calendar', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
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
export const selectBrand = id => write(['settings'], transaction => transaction.objectStore('settings').put({ id: 'activeBrand', value: id }));
export const storeBrand = brand => write(['brands', 'settings'], transaction => {
  transaction.objectStore('brands').put(brand);
  transaction.objectStore('settings').put({ id: 'activeBrand', value: brand.id });
});
