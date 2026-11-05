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
