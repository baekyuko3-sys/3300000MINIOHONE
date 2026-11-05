import test from 'node:test';
import assert from 'node:assert/strict';
import { getCharacterMemory, saveCharacterMemory } from '../src/store/characterMemory.ts';

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

function sampleMemory() {
  return {
    characterId: 'c1', characterName: 'Character', summary: 'new summary',
    items: [], updatedAt: new Date().toISOString(),
  };
}

test('corrupt persona memory is not overwritten by a later save', () => {
  const storage = new MemoryStorage();
  const key = 'phone:character-memory:c1:persona:p1';
  const original = '{broken-persona-memory';
  storage.setItem(key, original);
  installWindow(storage);
  getCharacterMemory('c1', 'Character', 'p1');
  saveCharacterMemory({ ...sampleMemory(), personaId: 'p1' });
  assert.equal(storage.getItem(key), original);
});

test('direct memory saves refuse an invalid existing schema', () => {
  const storage = new MemoryStorage();
  const key = 'phone:character-memory:c1';
  const original = JSON.stringify(['not', 'memory']);
  storage.setItem(key, original);
  installWindow(storage);
  saveCharacterMemory(sampleMemory());
  assert.equal(storage.getItem(key), original);
});
