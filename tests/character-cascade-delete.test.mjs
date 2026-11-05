import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAllCharacterMemoryVariants } from '../src/store/characterMemory.ts';
import { removeCharacterFromLineGroups } from '../src/store/lineGroups.ts';
import { unbindNpcCharacterReferences } from '../src/store/npcs.ts';

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function installWindow(storage) {
  globalThis.window = {
    localStorage: storage,
    dispatchEvent() { return true; },
  };
}

test('character deletion clears base and all persona-specific memory variants only for that character', () => {
  const storage = new MemoryStorage();
  storage.setItem('phone:character-memory:c1', JSON.stringify({ summary: 'base' }));
  storage.setItem('phone:character-memory:c1:persona:p1', JSON.stringify({ summary: 'persona one' }));
  storage.setItem('phone:character-memory:c1:persona:p2', JSON.stringify({ summary: 'persona two' }));
  storage.setItem('phone:character-memory:c10:persona:p1', JSON.stringify({ summary: 'different character' }));
  installWindow(storage);

  clearAllCharacterMemoryVariants('char:c1');
  assert.equal(storage.getItem('phone:character-memory:c1'), null);
  assert.equal(storage.getItem('phone:character-memory:c1:persona:p1'), null);
  assert.equal(storage.getItem('phone:character-memory:c1:persona:p2'), null);
  assert.notEqual(storage.getItem('phone:character-memory:c10:persona:p1'), null);
});

test('character deletion removes matching group members and relationship edges but keeps unrelated members', () => {
  const storage = new MemoryStorage();
  storage.setItem('line:groups', JSON.stringify([
    {
      id: 'g1', ownerId: 'user',
      members: [
        { id: 'user', kind: 'user', role: 'owner' },
        { id: 'char:c1', kind: 'character', characterId: 'char:c1', role: 'member' },
        { id: 'npc:n1', kind: 'npc', npcId: 'npc:n1', characterId: 'char:c1', role: 'member' },
        { id: 'char:c2', kind: 'character', characterId: 'char:c2', role: 'member' },
      ],
      relationships: [{ from: 'char:c1', to: 'char:c2', relation: 'old' }, { from: 'char:c2', to: 'user', relation: 'friend' }],
    },
    {
      id: 'g2', ownerId: 'char:c1',
      members: [{ id: 'char:c1', kind: 'character', characterId: 'char:c1', role: 'owner' }],
      relationships: [],
    },
  ]));
  installWindow(storage);

  assert.equal(removeCharacterFromLineGroups('char:c1'), 2);
  const groups = JSON.parse(storage.getItem('line:groups'));
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].members.map(member => member.id), ['user', 'npc:n1', 'char:c2']);
  assert.deepEqual(groups[0].relationships, [{ from: 'char:c2', to: 'user', relation: 'friend' }]);
});

test('character deletion unbinds NPC records without deleting NPCs or their own data', () => {
  const storage = new MemoryStorage();
  storage.setItem('phone:npcs', JSON.stringify([
    { id: 'npc:n1', name: 'NPC One', boundCharacterId: 'char:c1', boundCharacterName: 'Character One', sourceCharacterId: 'char:c1', sourceCharacterName: 'Character One', memory: 'keep' },
    { id: 'npc:n2', name: 'NPC Two', boundCharacterId: 'char:c2', boundCharacterName: 'Character Two' },
  ]));
  installWindow(storage);

  assert.equal(unbindNpcCharacterReferences('char:c1'), 1);
  const npcs = JSON.parse(storage.getItem('phone:npcs'));
  assert.equal(npcs.length, 2);
  assert.equal(npcs[0].boundCharacterId, '');
  assert.equal(npcs[0].boundCharacterName, '');
  assert.equal(npcs[0].sourceCharacterId, null);
  assert.equal(npcs[0].memory, 'keep');
  assert.equal(npcs[1].boundCharacterId, 'char:c2');
});
