import test from 'node:test';
import assert from 'node:assert/strict';
import { getNpcs } from '../src/store/npcs.ts';
import { getLineGroups } from '../src/store/lineGroups.ts';

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

test('NPC reader fails closed on valid JSON with the wrong top-level schema', () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify({ unexpected: 'do not overwrite' });
  storage.setItem('phone:npcs', original);
  installWindow(storage);
  assert.deepEqual(getNpcs(), []);
  assert.equal(storage.getItem('phone:npcs'), original);
});

test('LINE group reader fails closed on valid JSON with the wrong top-level schema', () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify({ groups: [{ id: 'g1' }] });
  storage.setItem('line:groups', original);
  installWindow(storage);
  assert.deepEqual(getLineGroups(), []);
  assert.equal(storage.getItem('line:groups'), original);
});
