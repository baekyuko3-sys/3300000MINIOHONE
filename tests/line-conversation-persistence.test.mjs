import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { saveLineConversationSnapshot } from '../src/store/lineRuntime.ts';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('LINE synchronously flushes the complete transcript before a chat switch can cancel the debounce', () => {
  const previousWindow = globalThis.window;
  const storage = new MemoryStorage();
  globalThis.window = { localStorage: storage };
  try {
    const messages = [
      { id: 'user-1', role: 'user', senderName: '我', text: '第一条消息', createdAt: '2026-11-05T08:00:00.000Z' },
      { id: 'ai-1', role: 'assistant', kind: 'ai-reply', senderName: '程凛', text: '角色回复', status: 'delivered' },
      { id: 'transfer-1', role: 'user', kind: 'transfer', transferStatus: 'accepted', metadata: { amount: '12.00', status: 'accepted' } },
    ];
    saveLineConversationSnapshot('chat-a', messages);
    const saved = JSON.parse(storage.getItem('line:conversation:chat-a'));
    assert.deepEqual(saved, messages);
    assert.equal(saved[2].transferStatus, 'accepted');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('LineConversationView flushes the full snapshot in the message persistence effect', async () => {
  const source = await readFile(new URL('../src/components/line/LineConversationView.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('saveLineConversationSnapshot(conversationStorageId, messages)'));
  assert.ok(source.includes('usePersistentState is debounced'));
});

test('LINE shows only one typing indicator while an empty AI placeholder is visible', async () => {
  const source = await readFile(new URL('../src/components/line/LineConversationView.tsx', import.meta.url), 'utf8');
  assert.match(source, /isTyping\s*&&\s*!visibleMessages\.some\(message\s*=>/);
  assert.match(source, /message\.kind\s*===\s*'ai-reply'/);
});


test('concurrent LINE tab additions merge without dropping either message', async () => {
  const { mergeConcurrentLineMessages } = await import('../src/store/lineRuntime.ts');
  const previous = [{ id: 'old', text: '已有消息' }];
  const local = [...previous, { id: 'from-tab-a', text: 'A 的消息' }];
  const remote = [...previous, { id: 'from-tab-b', text: 'B 的消息' }];
  const merged = mergeConcurrentLineMessages(local, previous, remote);
  assert.deepEqual(merged.map(item => item.id), ['old', 'from-tab-b', 'from-tab-a']);
});

test('remote LINE deletions are not resurrected by a local stale snapshot', async () => {
  const { mergeConcurrentLineMessages } = await import('../src/store/lineRuntime.ts');
  const previous = [{ id: 'keep', text: '保留' }, { id: 'delete', text: '删除' }];
  const local = [...previous, { id: 'local-new', text: '本地新增' }];
  const remote = [{ id: 'keep', text: '保留' }];
  const merged = mergeConcurrentLineMessages(local, previous, remote);
  assert.deepEqual(merged.map(item => item.id), ['keep', 'local-new']);
});
