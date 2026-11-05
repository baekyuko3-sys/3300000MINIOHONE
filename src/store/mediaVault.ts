const DB_NAME = 'sane333-media';
const STORE_NAME = 'media';
const DB_VERSION = 1;

interface MediaRecord {
  id: string;
  blob: Blob;
  createdAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('MEDIA_STORAGE_UNSUPPORTED'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      dbPromise = null;
      reject(error);
    };
    request.onerror = () => fail(request.error || new Error('MEDIA_DB_OPEN_FAILED'));
    request.onblocked = () => fail(new Error('MEDIA_DB_OPEN_BLOCKED: 请关闭其他旧版本页面后重试'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true;
      db.onclose = () => { dbPromise = null; };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
  });

  return dbPromise;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]+)*;base64,(.*)$/);
  if (!match) throw new Error('MEDIA_DATA_URL_INVALID');

  const byteString = atob(match[2]);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i += 1) bytes[i] = byteString.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('MEDIA_READ_FAILED'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(blob);
  });
}

export async function putMedia(dataUrl: string, preferredId?: string): Promise<string> {
  const db = await openDb();
  const id = preferredId || 'media-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const record: MediaRecord = { id, blob: dataUrlToBlob(dataUrl), createdAt: new Date().toISOString() };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('MEDIA_WRITE_FAILED'));
    tx.onabort = () => reject(tx.error || new Error('MEDIA_WRITE_ABORTED'));
  });

  return id;
}

export async function getMedia(id: string): Promise<string | null> {
  const db = await openDb();
  const record = await new Promise<MediaRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as MediaRecord | undefined);
    request.onerror = () => reject(request.error || new Error('MEDIA_READ_FAILED'));
  });
  return record ? blobToDataUrl(record.blob) : null;
}

export async function deleteMedia(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('MEDIA_DELETE_FAILED'));
    tx.onabort = () => reject(tx.error || new Error('MEDIA_DELETE_ABORTED'));
  });
}

export async function exportMedia(): Promise<Record<string, string>> {
  const db = await openDb();
  const records = await new Promise<MediaRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result || []) as MediaRecord[]);
    request.onerror = () => reject(request.error || new Error('MEDIA_EXPORT_FAILED'));
  });

  const output: Record<string, string> = {};
  for (const record of records) output[record.id] = await blobToDataUrl(record.blob);
  return output;
}

export async function getMediaStats(): Promise<{ count: number; size: number }> {
  const db = await openDb();
  const records = await new Promise<MediaRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result || []) as MediaRecord[]);
    request.onerror = () => reject(request.error || new Error('MEDIA_STATS_FAILED'));
  });
  return { count: records.length, size: records.reduce((total, record) => total + (record.blob?.size || 0), 0) };
}

export async function importMedia(records: Record<string, string>): Promise<number> {
  const entries = Object.entries(records || {});
  // Decode every file before opening a write transaction. Invalid media must not
  // leave a half-imported archive in IndexedDB.
  const prepared = entries.map(([id, dataUrl]) => {
    if (!id || typeof dataUrl !== 'string') throw new Error('MEDIA_IMPORT_RECORD_INVALID');
    return {
      id,
      blob: dataUrlToBlob(dataUrl),
      createdAt: new Date().toISOString(),
    } satisfies MediaRecord;
  });
  if (!prepared.length) return 0;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const record of prepared) store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('MEDIA_IMPORT_FAILED'));
    tx.onabort = () => reject(tx.error || new Error('MEDIA_IMPORT_ABORTED'));
  });
  return prepared.length;
}


/**
 * Replace the complete media vault in one IndexedDB transaction.
 * Decoding happens before the transaction; clear + puts either commit together or abort together.
 */
export async function replaceMedia(records: Record<string, string>): Promise<number> {
  const entries = Object.entries(records || {});
  const prepared = entries.map(([id, dataUrl]) => {
    if (!id || typeof dataUrl !== 'string') throw new Error('MEDIA_IMPORT_RECORD_INVALID');
    return {
      id,
      blob: dataUrlToBlob(dataUrl),
      createdAt: new Date().toISOString(),
    } satisfies MediaRecord;
  });
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const record of prepared) store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('MEDIA_REPLACE_FAILED'));
    tx.onabort = () => reject(tx.error || new Error('MEDIA_REPLACE_ABORTED'));
  });
  return prepared.length;
}
