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
    request.onerror = () => reject(request.error || new Error('MEDIA_DB_OPEN_FAILED'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
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

export async function importMedia(records: Record<string, string>): Promise<number> {
  let count = 0;
  for (const [id, dataUrl] of Object.entries(records || {})) {
    await putMedia(dataUrl, id);
    count += 1;
  }
  return count;
}
