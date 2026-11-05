import test from 'node:test';
import assert from 'node:assert/strict';
import { getGroupAiSummaries, saveGroupAiSummaries } from '../src/store/groupAiSummaries.ts';

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

test('corrupt group AI summary memory is not overwritten by an empty fallback', () => {
  const storage = new MemoryStorage();
  const key = 'line:group-ai-summaries:group-1';
  const original = '{broken-group-memory';
  storage.setItem(key, original);
  installWindow(storage);

  assert.deepEqual(getGroupAiSummaries('group-1'), []);
  assert.equal(saveGroupAiSummaries('group-1', []), false);
  assert.equal(storage.getItem(key), original);
});

test('direct group summary writes refuse a valid-JSON invalid schema', () => {
  const storage = new MemoryStorage();
  const key = 'line:group-ai-summaries:group-2';
  const original = JSON.stringify({ summaries: [] });
  storage.setItem(key, original);
  installWindow(storage);

  assert.equal(saveGroupAiSummaries('group-2', []), false);
  assert.equal(storage.getItem(key), original);
});
