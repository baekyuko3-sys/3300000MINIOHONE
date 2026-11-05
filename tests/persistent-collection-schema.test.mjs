import test from 'node:test';
import assert from 'node:assert/strict';
import { getNpcs, upsertNpc, upsertNpcs } from '../src/store/npcs.ts';
import { getLineGroups, upsertLineGroup } from '../src/store/lineGroups.ts';

class MemoryStorage {
  values = new Map();
  failKey = '';
  failOnce = false;
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    if (this.failOnce && key === this.failKey) { this.failOnce = false; throw new Error('quota exceeded'); }
    this.values.set(key, String(value));
  }
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


test('NPC mutations refuse to overwrite a valid-JSON but invalid-schema source', () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify({ unexpected: 'keep this' });
  storage.setItem('phone:npcs', original);
  installWindow(storage);
  upsertNpc({ id: 'npc-new', name: 'New NPC' });
  assert.equal(storage.getItem('phone:npcs'), original);
});

test('group mutations refuse to overwrite a valid-JSON but invalid-schema source', () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify({ groups: [{ id: 'g1' }] });
  storage.setItem('line:groups', original);
  installWindow(storage);
  const result = upsertLineGroup({ id: 'g2', name: 'Group', ownerId: 'user', members: [], announcement: '', createdAt: '', updatedAt: '' });
  assert.equal(result.ok, false);
  assert.equal(storage.getItem('line:groups'), original);
});


test('NPC batch save is atomic when localStorage rejects the write', () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify([{ id: 'npc-old', name: 'Old NPC' }]);
  storage.setItem('phone:npcs', original);
  storage.failKey = 'phone:npcs';
  storage.failOnce = true;
  installWindow(storage);
  assert.equal(upsertNpcs([{ id: 'npc-new', name: 'New NPC' }]), false);
  assert.equal(storage.getItem('phone:npcs'), original);
});
