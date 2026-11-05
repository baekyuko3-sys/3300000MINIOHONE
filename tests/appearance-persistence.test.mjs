import test from 'node:test';
import assert from 'node:assert/strict';
import { readAppearance, saveAppearance, getAppearanceSchemes, saveAppearanceScheme, getSavedFonts, saveFont } from '../src/store/appearance.ts';

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
}

test('corrupt appearance settings are not replaced with defaults on save', () => {
  const storage = new MemoryStorage();
  const original = '{broken-wallpaper-and-lock-settings';
  storage.setItem('sane333:appearance', original);
  installWindow(storage);
  readAppearance();
  assert.throws(() => saveAppearance({ appTitle: 'new title' }), /原始配置已保留/);
  assert.equal(storage.getItem('sane333:appearance'), original);
});

test('corrupt appearance schemes and saved fonts remain intact on direct writes', () => {
  const storage = new MemoryStorage();
  const schemes = JSON.stringify({ schemes: [] });
  const fonts = '{broken-fonts';
  storage.setItem('sane333:appearance-schemes', schemes);
  storage.setItem('sane333:saved-fonts', fonts);
  installWindow(storage);
  assert.deepEqual(getAppearanceSchemes().map(x => x.id), ['default']);
  assert.deepEqual(getSavedFonts(), []);
  assert.throws(() => saveAppearanceScheme('New scheme'));
  assert.throws(() => saveFont({ name: 'Font', source: 'url', value: 'https://example.test/font.woff2' }));
  assert.equal(storage.getItem('sane333:appearance-schemes'), schemes);
  assert.equal(storage.getItem('sane333:saved-fonts'), fonts);
});
