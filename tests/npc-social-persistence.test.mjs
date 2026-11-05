import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcFriendRequest, hasNpcFriendship, setNpcFriendship } from '../src/store/npcSocial.ts';

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

test('corrupt NPC friendship state fails closed and is never overwritten by new requests', () => {
  const storage = new MemoryStorage();
  const original = JSON.stringify({ friendships: [] });
  storage.setItem('line:npc-friendships', original);
  installWindow(storage);

  assert.equal(hasNpcFriendship('npc-1', 'persona-1'), true);
  assert.equal(setNpcFriendship('npc-1', 'persona-1', true), false);
  const result = createNpcFriendRequest({
    npc: { id: 'npc-1', name: 'NPC', active: true },
    personaId: 'persona-1',
    source: 'user-initiated',
    sourceLabel: '测试',
    message: 'hello',
  });
  assert.equal(result, null);
  assert.equal(storage.getItem('line:npc-friendships'), original);
  assert.equal(storage.getItem('line:npc-friend-requests'), null);
});

test('corrupt NPC friend-request records are not replaced with an empty request list', () => {
  const storage = new MemoryStorage();
  const original = '{broken-friend-requests';
  storage.setItem('line:npc-friend-requests', original);
  installWindow(storage);

  const result = createNpcFriendRequest({
    npc: { id: 'npc-2', name: 'NPC Two', active: true },
    personaId: 'persona-2',
    source: 'user-initiated',
    sourceLabel: '测试',
    message: 'hello',
  });
  assert.equal(result, null);
  assert.equal(storage.getItem('line:npc-friend-requests'), original);
});
