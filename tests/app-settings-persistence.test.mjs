import test from 'node:test';
import assert from 'node:assert/strict';
import { readAppSettings, saveAppSettings } from '../src/store/appSettings.ts';

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

test('corrupt AI settings are preserved and default settings are not written over them', () => {
  const storage = new MemoryStorage();
  const original = '{broken-ai-settings';
  storage.setItem('phone:settings', original);
  installWindow(storage);

  const settings = readAppSettings();
  assert.ok(settings);
  saveAppSettings({ apiKey: 'new-key-must-not-overwrite-corrupt-source' });
  assert.equal(storage.getItem('phone:settings'), original);
});

test('valid JSON with an invalid settings schema is preserved', () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify(['not', 'settings']);
  storage.setItem('phone:settings', original);
  installWindow(storage);

  saveAppSettings({ model: 'new-model' });
  assert.equal(storage.getItem('phone:settings'), original);
});
