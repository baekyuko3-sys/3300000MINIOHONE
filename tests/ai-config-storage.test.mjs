import test from 'node:test';
import assert from 'node:assert/strict';
import { readCharacterAiProfiles, saveCharacterAiProfiles } from '../src/store/characterAiProfiles.ts';
import { readApiPresets, saveApiPresets } from '../src/store/apiPresets.ts';

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

test('character-specific AI keys are preserved when their profile collection is corrupt', () => {
  const storage = new MemoryStorage();
  const original = '{broken-character-ai-profiles';
  storage.setItem('phone:character-ai-profiles', original);
  installWindow(storage);
  assert.deepEqual(readCharacterAiProfiles(), []);
  assert.equal(saveCharacterAiProfiles([]), false);
  assert.equal(storage.getItem('phone:character-ai-profiles'), original);
});

test('API presets and their secrets are preserved when the collection schema is invalid', () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify({ presets: [{ apiKey: 'keep-me' }] });
  storage.setItem('phone:api-presets', original);
  installWindow(storage);
  assert.deepEqual(readApiPresets(), []);
  assert.equal(saveApiPresets([]), false);
  assert.equal(storage.getItem('phone:api-presets'), original);
});
