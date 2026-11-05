import test from 'node:test';
import assert from 'node:assert/strict';
import { getCallHistory, saveCallRecord, clearCallHistory } from '../src/store/callHistory.ts';
import { readAiDebugLog, pushAiDebugLog } from '../src/store/aiDebug.ts';

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
  globalThis.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.Event = class Event { constructor(type) { this.type = type; } };
}

test('corrupt call history is preserved when a new call is saved', () => {
  const storage = new MemoryStorage();
  const original = '{broken-call-history';
  storage.setItem('line:call-history', original);
  installWindow(storage);

  assert.deepEqual(getCallHistory(), []);
  saveCallRecord({
    type: 'voice', characterId: 'c1', characterName: 'Character',
    duration: 12, transcript: [],
  });
  assert.equal(storage.getItem('line:call-history'), original);
});

test('explicit clear call history still removes a corrupt history key', () => {
  const storage = new MemoryStorage();
  storage.setItem('line:call-history', '{broken}');
  installWindow(storage);
  clearCallHistory();
  assert.equal(storage.getItem('line:call-history'), null);
});

test('corrupt AI debug logs are not overwritten by subsequent diagnostics', () => {
  const storage = new MemoryStorage();
  const original = '{broken-ai-debug-log';
  storage.setItem('phone:ai-debug-log', original);
  installWindow(storage);

  assert.deepEqual(readAiDebugLog(), []);
  pushAiDebugLog({ level: 'info', event: 'test', message: 'diagnostic' });
  assert.equal(storage.getItem('phone:ai-debug-log'), original);
});
