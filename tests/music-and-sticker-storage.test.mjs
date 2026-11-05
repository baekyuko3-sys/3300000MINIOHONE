import test from 'node:test';
import assert from 'node:assert/strict';
import { getUserPlaylists, saveUserPlaylists } from '../src/store/musicPlaylists.ts';
import { getMusicListenHistory, saveMusicListenHistory } from '../src/store/musicListenHistory.ts';
import { getStickerPacks, saveStickerPacks } from '../src/store/stickers.ts';

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

test('music playlists preserve malformed original data against fallback saves', () => {
  const storage = new MemoryStorage();
  const original = '{broken-playlists';
  storage.setItem('phone:music-user-playlists', original);
  installWindow(storage);
  assert.deepEqual(getUserPlaylists(), []);
  saveUserPlaylists([]);
  assert.equal(storage.getItem('phone:music-user-playlists'), original);
});

test('music listen history preserves malformed original data against fallback saves', () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify({ history: 'not-an-array' });
  storage.setItem('phone:music-listen-history', original);
  installWindow(storage);
  assert.deepEqual(getMusicListenHistory(), []);
  saveMusicListenHistory([]);
  assert.equal(storage.getItem('phone:music-listen-history'), original);
});

test('sticker packs preserve malformed original data against fallback saves', () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify({ packs: [] });
  storage.setItem('line:sticker-packs', original);
  installWindow(storage);
  assert.deepEqual(getStickerPacks(), []);
  saveStickerPacks([]);
  assert.equal(storage.getItem('line:sticker-packs'), original);
});


test('direct collection writes also refuse invalid existing schemas without a prior read', () => {
  const storage = new MemoryStorage();
  const playlistRaw = JSON.stringify({ items: [] });
  const historyRaw = JSON.stringify({ items: [] });
  const stickerRaw = JSON.stringify({ packs: [] });
  storage.setItem('phone:music-user-playlists', playlistRaw);
  storage.setItem('phone:music-listen-history', historyRaw);
  storage.setItem('line:sticker-packs', stickerRaw);
  installWindow(storage);

  saveUserPlaylists([]);
  saveMusicListenHistory([]);
  saveStickerPacks([]);

  assert.equal(storage.getItem('phone:music-user-playlists'), playlistRaw);
  assert.equal(storage.getItem('phone:music-listen-history'), historyRaw);
  assert.equal(storage.getItem('line:sticker-packs'), stickerRaw);
});
