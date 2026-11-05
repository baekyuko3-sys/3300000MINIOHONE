import test from 'node:test';
import assert from 'node:assert/strict';
import { studioStorage } from '../src/studio/studioStorage.ts';

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function installWindow(storage) {
  globalThis.window = { localStorage: storage, dispatchEvent() { return true; } };
  globalThis.localStorage = storage;
}

test('corrupt studio sessions are preserved instead of replaced by an empty list', () => {
  const storage = new MemoryStorage();
  const original = '{broken-studio-sessions';
  storage.setItem('studio:sessions', original);
  installWindow(storage);

  assert.deepEqual(studioStorage.sessions(), []);
  assert.equal(studioStorage.saveSessions([]), false);
  assert.equal(storage.getItem('studio:sessions'), original);
});

test('studio operation logs refuse writes when existing data has an invalid schema', () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify({ logs: [] });
  storage.setItem('studio:logs', original);
  installWindow(storage);

  studioStorage.addLog({ id: 'log-1', createdAt: new Date().toISOString(), action: 'test' });
  assert.equal(storage.getItem('studio:logs'), original);
});
