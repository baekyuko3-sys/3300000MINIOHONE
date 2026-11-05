import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNpcRuntimeContext } from '../src/store/npcContext.ts';
import { removeNpcReferences } from '../src/store/npcs.ts';

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

test('NPC runtime memory is isolated by user persona and never falls back to shared memory', () => {
  const storage = new MemoryStorage();
  installWindow(storage);
  storage.setItem('line:user-personas', JSON.stringify([
    { id: 'persona-a', name: 'Persona A' },
    { id: 'persona-b', name: 'Persona B' },
  ]));
  storage.setItem('phone:character-memory:1:persona:persona-a', JSON.stringify({
    characterId: 'npc-1', characterName: 'NPC', summary: 'MEMORY_A_ONLY', items: [], updatedAt: new Date().toISOString(), personaId: 'persona-a',
  }));
  storage.setItem('phone:character-memory:1:persona:persona-b', JSON.stringify({
    characterId: 'npc-1', characterName: 'NPC', summary: 'MEMORY_B_ONLY', items: [], updatedAt: new Date().toISOString(), personaId: 'persona-b',
  }));
  const npc = {
    id: 'npc-1', name: 'Test NPC', identity: '测试身份', personality: '测试性格',
    background: '测试背景', relationship: 'LEGACY_SHARED_RELATION', memory: 'LEGACY_SHARED_MEMORY',
    relationToMe: '', relationToMeName: '', worldBookIds: [], interests: [],
  };

  const contextA = buildNpcRuntimeContext(npc, 'online-chat', 'persona-a');
  const contextB = buildNpcRuntimeContext(npc, 'online-chat', 'persona-b');
  assert.match(contextA, /MEMORY_A_ONLY/);
  assert.doesNotMatch(contextA, /MEMORY_B_ONLY|LEGACY_SHARED_MEMORY/);
  assert.match(contextB, /MEMORY_B_ONLY/);
  assert.doesNotMatch(contextB, /MEMORY_A_ONLY|LEGACY_SHARED_MEMORY/);
});


test('deleting an NPC removes its persona chats and references without disturbing other chats', () => {
  const storage = new MemoryStorage();
  installWindow(storage);
  storage.setItem('line:groups', JSON.stringify([{
    id: 'group-1',
    ownerId: 'npc-1',
    members: [
      { id: 'npc-1', npcId: 'npc-1', kind: 'npc', role: 'owner' },
      { id: 'user-1', kind: 'user', role: 'member' },
    ],
    relationships: [{ from: 'npc-1', to: 'user-1', relation: 'friend' }],
  }]));
  storage.setItem('line:friends-list', JSON.stringify([
    { id: 'npc-friend', npcId: 'npc-1', name: 'NPC One' },
    { id: 'other-friend', npcId: 'npc-2', name: 'NPC Two' },
  ]));
  storage.setItem('line:chat-items', JSON.stringify([
    { id: 'npc-chat-a', npcId: 'npc-1', personaId: 'persona-a', name: 'NPC One' },
    { id: 'npc-chat-b', npcId: 'npc-1', personaId: 'persona-b', name: 'NPC One' },
    { id: 'other-chat', npcId: 'npc-2', name: 'NPC Two' },
  ]));
  storage.setItem('line:conversation:npc-chat-a', JSON.stringify([{ id: 'm1', role: 'user', text: 'private A' }]));
  storage.setItem('line:conversation:npc-chat-b', JSON.stringify([{ id: 'm2', role: 'assistant', text: 'private B' }]));
  storage.setItem('line:custom-css:npc-chat-a', '.private{}');
  storage.setItem('line:runtime:conversations', JSON.stringify({
    'npc-chat-a': { id: 'npc-chat-a', name: 'NPC One', isGroup: false },
    'npc-chat-b': { id: 'npc-chat-b', name: 'NPC One', isGroup: false },
  }));
  storage.setItem('line:runtime:notifications', JSON.stringify([
    { id: 'n1', type: 'message', conversationId: 'npc-chat-a', characterId: 'npc-1', title: 'NPC', body: 'hello', createdAt: '2026-11-05', read: false },
    { id: 'n3', type: 'message', characterId: 'npc-1', title: 'NPC', body: 'orphaned identity notification', createdAt: '2026-11-05', read: false },
    { id: 'n2', type: 'message', conversationId: 'other-chat', title: 'Other', body: 'hello', createdAt: '2026-11-05', read: false },
  ]));

  removeNpcReferences('npc-1');

  const groups = JSON.parse(storage.getItem('line:groups'));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].ownerId, 'user-1');
  assert.deepEqual(groups[0].members.map(member => member.id), ['user-1']);
  assert.deepEqual(groups[0].relationships, []);
  assert.deepEqual(JSON.parse(storage.getItem('line:friends-list')).map(friend => friend.npcId), ['npc-2']);
  assert.deepEqual(JSON.parse(storage.getItem('line:chat-items')).map(chat => chat.id), ['other-chat']);
  assert.equal(storage.getItem('line:conversation:npc-chat-a'), null);
  assert.equal(storage.getItem('line:conversation:npc-chat-b'), null);
  assert.equal(storage.getItem('line:custom-css:npc-chat-a'), null);
  assert.deepEqual(JSON.parse(storage.getItem('line:runtime:notifications')).map(item => item.id), ['n2']);
});
