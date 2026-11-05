import test from 'node:test';
import assert from 'node:assert/strict';
import { exportLineBackup, importLineBackup, migrateLineIdentityPrefixes, migrateLineMessagesToRole, removeLineConversationData } from '../src/store/lineRuntime.ts';

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


test('identity migration resumes after a partial run already prefixed character and NPC records', () => {
  const storage = new MemoryStorage();
  storage.setItem('phone:characters', JSON.stringify([{ id: 'char:c1', name: 'Character' }]));
  storage.setItem('phone:npcs', JSON.stringify([{ id: 'npc:n1', name: 'NPC', boundCharacterId: 'char:c1' }]));
  storage.setItem('line:conversation:c1', JSON.stringify([{ id: 'm1', role: 'user', text: 'preserve' }]));
  storage.setItem('line:chat-items', JSON.stringify([{ id: 'c1', characterId: 'c1', name: 'Character' }]));
  storage.setItem('line:runtime:conversations', JSON.stringify({
    c1: { id: 'c1', characterId: 'c1', name: 'Character', isGroup: false },
  }));
  installWindow(storage);

  const report = migrateLineIdentityPrefixes();
  assert.equal(report.conversationKeysRenamed, 1);
  assert.equal(storage.getItem('line:conversation:c1'), null);
  assert.equal(JSON.parse(storage.getItem('line:conversation:char:c1'))[0].text, 'preserve');
  assert.equal(JSON.parse(storage.getItem('line:chat-items'))[0].id, 'char:c1');
  assert.ok(JSON.parse(storage.getItem('line:runtime:conversations'))['char:c1']);
  assert.equal(storage.getItem('line:fix-id-prefix-v1'), '1');
});

test('LINE migration backup includes chat index, contacts, groups and the full wallet ledger', async () => {
  const storage = new MemoryStorage();
  storage.setItem('line:chat-items', JSON.stringify([{ id: 'chat-1', name: 'Chat' }]));
  storage.setItem('line:friends-list', JSON.stringify([{ id: 'friend-1', name: 'Friend' }]));
  storage.setItem('line:groups', JSON.stringify([{ id: 'group-1', name: 'Group', members: [] }]));
  storage.setItem('line:wallet-ledger-v1', JSON.stringify({
    version: 1, balanceCents: 1234, transactions: [{ id: 'tx-1', type: 'topup', amount: 12.34, desc: '充值', createdAt: '2026-11-05T00:00:00.000Z' }],
    transfers: [], packets: [], familyCards: [],
  }));
  installWindow(storage);
  const backup = exportLineBackup();
  assert.equal(backup.chatItems.length, 1);
  assert.equal(backup.friends.length, 1);
  assert.equal(backup.groups.length, 1);
  assert.equal(backup.walletLedger.balanceCents, 1234);
  assert.equal(backup.walletLedger.transactions.length, 1);
  assert.equal(backup.mediaIncluded, false);
});

test('LINE backup import restores chat index, contacts, groups and wallet ledger together', () => {
  const storage = new MemoryStorage();
  installWindow(storage);
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations: { 'chat-2': [{ id: 'm2', role: 'user', text: 'hello' }] },
    metadata: { 'chat-2': { id: 'chat-2', name: 'Chat 2', isGroup: false } },
    notifications: [],
    chatItems: [{ id: 'chat-2', name: 'Chat 2' }],
    friends: [{ id: 'friend-2', name: 'Friend 2' }],
    groups: [{ id: 'group-2', name: 'Group 2', members: [] }],
    walletLedger: {
      version: 1, balanceCents: 8800, transactions: [{ id: 'tx-2', type: 'topup', amount: 88, desc: '充值', createdAt: '2026-11-05T00:00:00.000Z' }],
      transfers: [], packets: [], familyCards: [],
    },
  };
  importLineBackup(backup);
  assert.equal(JSON.parse(storage.getItem('line:chat-items'))[0].id, 'chat-2');
  assert.equal(JSON.parse(storage.getItem('line:friends-list'))[0].id, 'friend-2');
  assert.equal(JSON.parse(storage.getItem('line:groups'))[0].id, 'group-2');
  assert.equal(JSON.parse(storage.getItem('line:wallet-ledger-v1')).balanceCents, 8800);
  assert.equal(JSON.parse(storage.getItem('line:wallet-ledger-v1:backup')).balanceCents, 8800);
});

test('legacy version-one transcript backups remain importable without replacing wallet data', () => {
  const storage = new MemoryStorage();
  const currentWallet = JSON.stringify({ version: 1, balanceCents: 500, transactions: [], transfers: [], packets: [], familyCards: [] });
  storage.setItem('line:wallet-ledger-v1', currentWallet);
  installWindow(storage);
  importLineBackup({
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations: { 'legacy-chat': [{ id: 'm1', role: 'user', text: 'old backup' }] },
    metadata: {},
    notifications: [],
  });
  assert.equal(storage.getItem('line:wallet-ledger-v1'), currentWallet);
});


test('identity migration does not mark completion when a source store is corrupt and can resume after repair', () => {
  const storage = new MemoryStorage();
  const corrupt = '{broken-character-store';
  storage.setItem('phone:characters', corrupt);
  storage.setItem('phone:npcs', JSON.stringify([]));
  installWindow(storage);

  const first = migrateLineIdentityPrefixes();
  assert.deepEqual(first, {
    charactersRenamed: 0,
    npcsRenamed: 0,
    conversationKeysRenamed: 0,
    messageIdentitiesPrefixed: 0,
    skipped: [],
  });
  assert.equal(storage.getItem('phone:characters'), corrupt);
  assert.equal(storage.getItem('line:fix-id-prefix-v1'), null);

  storage.setItem('phone:characters', JSON.stringify([{ id: 'c2', name: 'Character 2' }]));
  storage.setItem('line:conversation:c2', JSON.stringify([{ id: 'm2', role: 'user', text: 'preserve' }]));
  const second = migrateLineIdentityPrefixes();
  assert.equal(second.charactersRenamed, 1);
  assert.equal(second.conversationKeysRenamed, 1);
  assert.equal(storage.getItem('line:fix-id-prefix-v1'), '1');
  assert.equal(JSON.parse(storage.getItem('line:conversation:char:c2'))[0].text, 'preserve');
});

test('role migration never overwrites a malformed conversation transcript', () => {
  const storage = new MemoryStorage();
  const corrupt = '{broken-transcript';
  storage.setItem('line:conversation:chat-corrupt', corrupt);
  installWindow(storage);
  const report = migrateLineMessagesToRole();
  assert.deepEqual(report, { conversations: 0, messages: 0 });
  assert.equal(storage.getItem('line:conversation:chat-corrupt'), corrupt);
});


test('LINE chat cleanup never overwrites corrupt runtime metadata or notification storage', () => {
  const storage = new MemoryStorage();
  const corruptMeta = '{broken-runtime-meta';
  const corruptNotifications = '{broken-notifications';
  storage.setItem('line:runtime:conversations', corruptMeta);
  storage.setItem('line:runtime:notifications', corruptNotifications);
  storage.setItem('line:conversation:chat-corrupt', JSON.stringify([{ id: 'm1', text: 'keep original transcript until explicit cleanup' }]));
  storage.setItem('line:chat-items', JSON.stringify([{ id: 'chat-corrupt', name: 'Chat' }]));
  installWindow(storage);

  removeLineConversationData('chat-corrupt');

  assert.equal(storage.getItem('line:runtime:conversations'), corruptMeta);
  assert.equal(storage.getItem('line:runtime:notifications'), corruptNotifications);
  assert.equal(storage.getItem('line:conversation:chat-corrupt'), null);
});


test('deleting a character removes every persona chat transcript but preserves bound NPC chats', () => {
  const storage = new MemoryStorage();
  installWindow(storage);
  storage.setItem('line:chat-items', JSON.stringify([
    { id: 'c_persona_a', characterId: 'char:c1', personaId: 'persona-a', name: 'Character' },
    { id: 'c_persona_b', characterId: 'char:c1', personaId: 'persona-b', name: 'Character' },
    { id: 'npc_chat', characterId: 'char:c1', npcId: 'npc:n1', name: 'NPC' },
  ]));
  storage.setItem('line:conversation:c_persona_a', JSON.stringify([{ id: 'a1', role: 'user', text: 'persona A history' }]));
  storage.setItem('line:conversation:c_persona_b', JSON.stringify([{ id: 'b1', role: 'assistant', text: 'persona B history' }]));
  storage.setItem('line:conversation:npc_chat', JSON.stringify([{ id: 'n1', role: 'assistant', text: 'NPC history' }]));
  storage.setItem('line:runtime:conversations', JSON.stringify({
    c_persona_a: { id: 'c_persona_a', name: 'Character A', isGroup: false },
    c_persona_b: { id: 'c_persona_b', name: 'Character B', isGroup: false },
    npc_chat: { id: 'npc_chat', name: 'NPC', isGroup: false },
  }));
  storage.setItem('line:runtime:notifications', JSON.stringify([
    { id: 'a', type: 'message', conversationId: 'c_persona_a', characterId: 'char:c1', title: 'A', body: '', createdAt: '', read: false },
    { id: 'b', type: 'message', conversationId: 'c_persona_b', characterId: 'char:c1', title: 'B', body: '', createdAt: '', read: false },
    { id: 'n', type: 'message', conversationId: 'npc_chat', characterId: 'npc:n1', title: 'NPC', body: '', createdAt: '', read: false },
  ]));
  storage.setItem('line:custom-css:c_persona_a', '.old{}');

  removeLineConversationData('char:c1', { removeChatItem: true });

  assert.equal(storage.getItem('line:conversation:c_persona_a'), null);
  assert.equal(storage.getItem('line:conversation:c_persona_b'), null);
  assert.equal(storage.getItem('line:custom-css:c_persona_a'), null);
  assert.notEqual(storage.getItem('line:conversation:npc_chat'), null);
  assert.deepEqual(JSON.parse(storage.getItem('line:chat-items')).map(chat => chat.id), ['npc_chat']);
  const meta = JSON.parse(storage.getItem('line:runtime:conversations'));
  assert.equal(meta.c_persona_a, undefined);
  assert.ok(meta.npc_chat);
  assert.deepEqual(JSON.parse(storage.getItem('line:runtime:notifications')).map(item => item.id), ['n']);
});

test('keeping a deleted character chat archives all persona entries and preserves their transcripts', () => {
  const storage = new MemoryStorage();
  installWindow(storage);
  storage.setItem('line:chat-items', JSON.stringify([
    { id: 'c_persona_a', characterId: 'char:c2', personaId: 'persona-a', name: 'Character', unread: 3 },
    { id: 'c_persona_b', characterId: 'char:c2', personaId: 'persona-b', name: 'Character', unread: 2 },
    { id: 'npc_chat', characterId: 'char:c2', npcId: 'npc:n2', name: 'NPC' },
  ]));
  storage.setItem('line:conversation:c_persona_a', JSON.stringify([{ id: 'a1', role: 'user', text: 'keep A' }]));
  storage.setItem('line:conversation:c_persona_b', JSON.stringify([{ id: 'b1', role: 'assistant', text: 'keep B' }]));
  storage.setItem('line:runtime:notifications', JSON.stringify([
    { id: 'a', type: 'message', conversationId: 'c_persona_a', characterId: 'char:c2', title: 'A', body: '', createdAt: '', read: false },
    { id: 'b', type: 'message', conversationId: 'c_persona_b', characterId: 'char:c2', title: 'B', body: '', createdAt: '', read: false },
  ]));

  removeLineConversationData('char:c2', { removeChatItem: false });

  const chats = JSON.parse(storage.getItem('line:chat-items'));
  assert.equal(chats.length, 3);
  assert.equal(chats[0].characterId, undefined);
  assert.equal(chats[1].characterId, undefined);
  assert.equal(chats[0].unread, 0);
  assert.equal(chats[1].unread, 0);
  assert.equal(chats[2].npcId, 'npc:n2');
  assert.notEqual(storage.getItem('line:conversation:c_persona_a'), null);
  assert.notEqual(storage.getItem('line:conversation:c_persona_b'), null);
  assert.deepEqual(JSON.parse(storage.getItem('line:runtime:notifications')), []);
});


test('archiving a legacy character-ID conversation preserves its transcript settings and metadata', () => {
  const storage = new MemoryStorage();
  installWindow(storage);
  storage.setItem('line:chat-items', JSON.stringify([
    { id: 'char:c3', characterId: 'char:c3', name: 'Legacy Character', unread: 4 },
  ]));
  storage.setItem('line:conversation:char:c3', JSON.stringify([{ id: 'legacy-1', role: 'user', text: 'must remain' }]));
  storage.setItem('line:status:char:c3', JSON.stringify({ enabled: true }));
  storage.setItem('line:runtime:conversations', JSON.stringify({
    'char:c3': { id: 'char:c3', name: 'Legacy Character', isGroup: false },
  }));
  storage.setItem('line:runtime:notifications', JSON.stringify([
    { id: 'legacy-notice', type: 'message', conversationId: 'char:c3', characterId: 'char:c3', title: 'Legacy', body: '', createdAt: '', read: false },
  ]));

  removeLineConversationData('char:c3', { removeChatItem: false });

  assert.notEqual(storage.getItem('line:conversation:char:c3'), null);
  assert.notEqual(storage.getItem('line:status:char:c3'), null);
  assert.ok(JSON.parse(storage.getItem('line:runtime:conversations'))['char:c3']);
  const archived = JSON.parse(storage.getItem('line:chat-items'))[0];
  assert.equal(archived.characterId, undefined);
  assert.equal(archived.unread, 0);
  assert.equal(archived.chatLabel, '已归档角色');
  assert.deepEqual(JSON.parse(storage.getItem('line:runtime:notifications')), []);
});
