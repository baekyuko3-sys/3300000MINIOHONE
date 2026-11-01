import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNpcRuntimeContext } from '../src/store/npcContext.ts';

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
  storage.setItem('phone:character-memory:npc-1:persona:persona-a', JSON.stringify({
    characterId: 'npc-1', characterName: 'NPC', summary: 'MEMORY_A_ONLY', items: [], updatedAt: new Date().toISOString(), personaId: 'persona-a',
  }));
  storage.setItem('phone:character-memory:npc-1:persona:persona-b', JSON.stringify({
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
