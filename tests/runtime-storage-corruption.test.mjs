import test from 'node:test';
import assert from 'node:assert/strict';
import { removeCharacterOfflineEvents } from '../src/store/offlineEvents.ts';
import { removeCharacterRuntime } from '../src/store/worldRuntime.ts';

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
}

test('character cleanup never overwrites malformed offline event data', () => {
  const storage = new MemoryStorage();
  const original = '{broken-offline-events';
  storage.setItem('phone:offline-events', original);
  installWindow(storage);
  assert.equal(removeCharacterOfflineEvents('char:c1'), false);
  assert.equal(storage.getItem('phone:offline-events'), original);
});

test('world runtime cleanup never overwrites a valid-JSON invalid-schema source', () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify({ characters: 'not-an-object', events: [] });
  storage.setItem('phone:world-runtime-v1', original);
  installWindow(storage);
  removeCharacterRuntime('char:c1');
  assert.equal(storage.getItem('phone:world-runtime-v1'), original);
});
