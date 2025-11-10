const DB_NAME = 'finance-tracker';
const DB_VERSION = 1;

let db;

export async function initDb() {
  return new Promise((resolve, reject) => {
    const openReq = indexedDB.open(DB_NAME, DB_VERSION);
    openReq.onupgradeneeded = () => {
      const d = openReq.result;
      if (!d.objectStoreNames.contains('valuations')) {
        const store = d.createObjectStore('valuations', { keyPath: 'id', autoIncrement: true });
        store.createIndex('by_date', 'date');
        store.createIndex('by_kind_name', ['kind', 'name']);
      }
      if (!d.objectStoreNames.contains('snapshots')) {
        const store = d.createObjectStore('snapshots', { keyPath: 'date' });
      }
    };
    openReq.onsuccess = () => { db = openReq.result; resolve(); };
    openReq.onerror = () => reject(openReq.error);
  });
}

export function addValuationPoint({ kind, name, value, date }) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['valuations'], 'readwrite');
    tx.objectStore('valuations').add({ kind, name, value, date });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function getAllValuations() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['valuations'], 'readonly');
    const req = tx.objectStore('valuations').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export function getRecentValuations(limit = 8) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['valuations'], 'readonly');
    const req = tx.objectStore('valuations').getAll();
    req.onsuccess = () => {
      const all = (req.result || []).sort((a,b) => b.date.localeCompare(a.date));
      resolve(all.slice(0, limit));
    };
    req.onerror = () => reject(req.error);
  });
}

export function writeSnapshots(snapshots) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['snapshots'], 'readwrite');
    const store = tx.objectStore('snapshots');
    for (const s of snapshots) {
      store.put(s);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function readSnapshots() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['snapshots'], 'readonly');
    const req = tx.objectStore('snapshots').getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a,b) => a.date.localeCompare(b.date)));
    req.onerror = () => reject(req.error);
  });
}


