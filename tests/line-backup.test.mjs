import test from 'node:test';
import assert from 'node:assert/strict';
import { exportLineBackup, importLineBackup } from '../src/store/lineRuntime.ts';

class MemoryStorage {
  values = new Map();
  failKey = '';
  failOnce = false;
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    if (this.failOnce && key === this.failKey) {
      this.failOnce = false;
      throw new Error('quota exceeded');
    }
    this.values.set(key, String(value));
  }
  removeItem(key) { this.values.delete(key); }
}

function installWindow(storage) {
  globalThis.window = {
    localStorage: storage,
    dispatchEvent() { return true; },
  };
}

test('LINE backup export explicitly marks the IndexedDB media vault as excluded', () => {
  const storage = new MemoryStorage();
  installWindow(storage);
  const backup = exportLineBackup();
  assert.equal(backup.version, 1);
  assert.equal(backup.mediaIncluded, false);
});

test('LINE backup import validates every conversation before writing anything', () => {
  const storage = new MemoryStorage();
  storage.setItem('line:conversation:existing', JSON.stringify([{ id: 'keep', text: 'old' }]));
  installWindow(storage);
  const before = new Map(storage.values);
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations: { 'chat-1': [null] },
    metadata: {},
    notifications: [],
  };
  assert.throws(() => importLineBackup(backup), /LINE_BACKUP_MESSAGE_INVALID/);
  assert.deepEqual(storage.values, before);
});

test('LINE backup import rolls back earlier writes when a later write fails', () => {
  const storage = new MemoryStorage();
  const oldConversation = JSON.stringify([{ id: 'old', text: 'preserve me' }]);
  const oldMetadata = JSON.stringify({ old: { id: 'old', name: 'Old', isGroup: false } });
  storage.setItem('line:conversation:chat-1', oldConversation);
  storage.setItem('line:runtime:conversations', oldMetadata);
  storage.failKey = 'line:runtime:conversations';
  storage.failOnce = true;
  installWindow(storage);

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations: { 'chat-1': [{ id: 'new', sender: 'me', text: 'new message' }] },
    metadata: { 'chat-1': { id: 'chat-1', name: 'New', isGroup: false, updatedAt: new Date().toISOString(), unread: 0, muted: false, pinned: false } },
    notifications: [],
  };
  assert.throws(() => importLineBackup(backup), /LINE_BACKUP_IMPORT_FAILED_ROLLED_BACK/);
  assert.equal(storage.getItem('line:conversation:chat-1'), oldConversation);
  assert.equal(storage.getItem('line:runtime:conversations'), oldMetadata);
});

test('LINE backup import writes the fully validated snapshot on success', () => {
  const storage = new MemoryStorage();
  installWindow(storage);
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations: { 'chat-1': [{ id: 'm1', sender: 'me', text: 'hello' }] },
    metadata: { 'chat-1': { id: 'chat-1', name: 'Chat', isGroup: false, updatedAt: new Date().toISOString(), unread: 0, muted: false, pinned: false } },
    notifications: [],
  };
  importLineBackup(backup);
  assert.equal(JSON.parse(storage.getItem('line:conversation:chat-1'))[0].text, 'hello');
  assert.equal(JSON.parse(storage.getItem('line:runtime:conversations'))['chat-1'].name, 'Chat');
  assert.deepEqual(JSON.parse(storage.getItem('line:runtime:notifications')), []);
});
