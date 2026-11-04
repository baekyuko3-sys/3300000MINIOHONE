import test from 'node:test';
import assert from 'node:assert/strict';
import { isLineMessageFromUser, normalizeLineMessage, bareIdentityId, withCharPrefix, withNpcPrefix, npcConversationId, formatChatListTime } from '../src/store/lineRuntime.ts';

test('LINE uses role as the sole authority for message direction', () => {
  assert.equal(isLineMessageFromUser({ role: 'user' }), true);
  assert.equal(isLineMessageFromUser({ role: 'assistant' }), false);
  assert.equal(isLineMessageFromUser({ role: 'system' }), false);
  assert.equal(isLineMessageFromUser({}), false);
  assert.equal(isLineMessageFromUser(null), false);
});

test('explicit role always wins over conflicting kind, nickname, or senderType metadata', () => {
  assert.equal(isLineMessageFromUser({ role: 'user', senderType: 'user', kind: 'text', senderName: '我' }), true);
  assert.equal(isLineMessageFromUser({ role: 'assistant', senderType: 'character', kind: 'ai-reply', senderName: '程凛' }), false);
  assert.equal(isLineMessageFromUser({ role: 'assistant', kind: 'ai-reply' }), false);
  assert.equal(isLineMessageFromUser({ role: 'user', kind: 'text' }), true);
});

test('clear chat offers two buttons: messages only, or messages plus memory', async () => {
  // Delete message != delete memory: the settings panel must offer both, and
  // the confirm dialog must run the mode the user picked.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/line/LineConversationView.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('清空当前聊天'));
  assert.ok(source.includes('清空聊天加记忆'));
  assert.ok(source.includes('清除群聊记录加记忆'));
  assert.ok(source.includes("openClearConfirm('chat')"));
  assert.ok(source.includes("openClearConfirm('chatMemory')"));
  assert.ok(source.includes('handleClearChat(clearMode === \'chatMemory\')'));
  assert.ok(source.includes('已清空聊天记录（记忆已保留）'));
});

test('chat list hides the version badge when no version is set', async () => {
  // A character with no version name must not be labelled '默认版本': the
  // list only shows a version badge when a real version exists.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/line/LineAppView.tsx', import.meta.url), 'utf8');
  assert.ok(!source.includes("variantLabel: existing?.variantLabel || '默认版本'"));
  assert.ok(!source.includes("variantLabel: session.variantLabel || '默认版本'"));
  assert.ok(source.includes("item.variantLabel !== '默认版本'"));
  assert.ok(source.includes("(character?.variantLabel || character?.characterVersion || '')"));
});

test('opening a chat clears its unread badge synchronously', async () => {
  // The list tap used to clear unread only in memory while storage still
  // held 1 behind a 300ms debounce; markLineConversationRead then fired a
  // runtime event whose refresh read the stale storage and restored the 1.
  // Opening must now write the cleared value to storage synchronously,
  // before any event fires.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/line/LineAppView.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('clearChatUnreadNow(item.id)'));
  assert.ok(source.includes('const clearChatUnreadNow = (chatId: string) => {'));
  assert.ok(source.includes("window.localStorage.setItem('line:chat-items', JSON.stringify(parsed.map((c: any) => (c?.id === chatId ? { ...c, unread: 0 } : c))))"));
});

test('friends tab has side-by-side character / NPC / group tabs, no persona notice row', async () => {
  // The friends tab is grouped by three side-by-side tabs instead of one flat
  // list; the "当前是..." notice row is gone, and the friend row no longer
  // renders the internal 角色卡联系人 note as its subtitle.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/line/LineAppView.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes("useState<'character' | 'npc' | 'group'>('character')"));
  assert.ok(source.includes('characterFriends.length'));
  assert.ok(source.includes('npcFriends.length'));
  assert.ok(source.includes('groupChats.length'));
  assert.ok(source.includes('shownTabFriends'));
  assert.ok(!source.includes('只显示绑定的'));
  assert.ok(!source.includes(`<div className="text-[10px] text-[#aaa] mt-1 truncate">\n                      {friend.note}\n                    </div>`));
  assert.ok(source.includes("friend.variantLabel !== '默认版本'"));
});

test('chat list time comes from the real timestamp, never a missing field', () => {
  // Missing/invalid timestamps read as just-created, never as a wrong date.
  assert.equal(formatChatListTime(undefined), '刚刚');
  assert.equal(formatChatListTime(''), '刚刚');
  assert.equal(formatChatListTime('not-a-date'), '刚刚');
  assert.equal(formatChatListTime(new Date()), '刚刚');
  // Today -> HH:MM (a fixed morning time can never be yesterday).
  const now = new Date();
  const thisMorning = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 30);
  assert.equal(formatChatListTime(thisMorning.toISOString()), '10:30');
  // Yesterday -> '昨天'.
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10, 30);
  assert.equal(formatChatListTime(yesterday.toISOString()), '昨天');
  // Older year -> full date.
  assert.equal(formatChatListTime('2020-03-05T10:30:00'), '2020-03-05');
  // 60 days ago -> MM-DD this year, or full date across a year boundary.
  const old = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60, 10, 30);
  const mm = String(old.getMonth() + 1).padStart(2, '0');
  const dd = String(old.getDate()).padStart(2, '0');
  const expected = old.getFullYear() === now.getFullYear() ? `${mm}-${dd}` : `${old.getFullYear()}-${mm}-${dd}`;
  assert.equal(formatChatListTime(old.toISOString()), expected);
});

test('role-less messages fall back to legacy sender only (never nickname, kind, or senderType)', () => {
  // Legacy sender is the old side field: it may decide side ONLY when role is
  // absent. New code never writes sender, so this cannot contradict a role.
  assert.equal(isLineMessageFromUser({ sender: 'me' }), true);
  assert.equal(isLineMessageFromUser({ sender: 'user' }), true);
  assert.equal(isLineMessageFromUser({ sender: 'other' }), false);
  assert.equal(isLineMessageFromUser({ sender: 'system' }), false);
  // A present role always wins over a conflicting legacy sender.
  assert.equal(isLineMessageFromUser({ role: 'assistant', sender: 'me' }), false);
  assert.equal(isLineMessageFromUser({ role: 'user', sender: 'other' }), true);
});

test('role-less messages never infer side from senderType, nickname, or kind', () => {
  assert.equal(isLineMessageFromUser({ senderType: 'user' }), false);
  assert.equal(isLineMessageFromUser({ metadata: { senderType: 'user' } }), false);
  assert.equal(isLineMessageFromUser({ senderType: 'character' }), false);
  assert.equal(isLineMessageFromUser({ senderType: 'npc' }), false);
  assert.equal(isLineMessageFromUser({ senderType: 'system' }), false);
  assert.equal(isLineMessageFromUser({ kind: 'ai-reply', senderName: '角色' }), false);
  assert.equal(isLineMessageFromUser({ senderName: '我' }), false);
});

test('LINE bubble wrapper preserves its original width and alignment classes', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/line/LineConversationView.tsx', import.meta.url), 'utf8');
  assert.match(source, /className=\{\`line-message-bubble min-w-0 flex flex-col \$\{isGroup && !isMe \?/);
  assert.ok(source.includes("'max-w-[78%] relative touch-pan-y select-none ' + (isMe ? 'items-end' : 'items-start')"));
  assert.ok(source.includes('line-message-row w-full flex flex-row flex-nowrap items-end gap-2 transition-transform'));
  assert.ok(source.includes('line-message-row--me justify-end'));
  assert.ok(source.includes('line-message-row--other justify-start'));
  assert.ok(!source.includes("isMe ? 'ml-auto ' : ''"));
  assert.ok(!source.includes("style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end'"));
  assert.ok(source.includes('w-fit max-w-full rounded-[16px] px-3 py-1.5 text-[13px] leading-[1.5] whitespace-pre-wrap [overflow-wrap:anywhere] select-text'));
});

test('LINE outgoing message uses its single existing optional avatar after the bubble', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/line/LineConversationView.tsx', import.meta.url), 'utf8');
  const rowStart = source.indexOf('w-full flex flex-row flex-nowrap items-end gap-2 transition-transform');
  const bubbleContainer = source.indexOf('{/* Bubble content container */}', rowStart);
  const existingAvatar = source.indexOf('{/* Optional user avatar */}', bubbleContainer);
  const rowEnd = source.indexOf('{/* Timestamp belongs below the message bubble', existingAvatar);
  assert.ok(rowStart >= 0 && bubbleContainer > rowStart && existingAvatar > bubbleContainer && rowEnd > existingAvatar);
  assert.match(source.slice(existingAvatar, rowEnd), /\{isMe && showMyAvatar &&/);
  assert.match(source.slice(bubbleContainer, existingAvatar), /max-w-\[78%\]/);
});

test('LINE layout exposes semantic classes for editable custom CSS', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/line/LineConversationView.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('line-message-row'));
  assert.ok(source.includes('line-message-bubble'));
  assert.ok(source.includes('line-message-avatar--me'));
  assert.ok(source.includes('line-message-avatar--other'));
  assert.ok(source.includes('dangerouslySetInnerHTML={{ __html: `${customCss}\\n${offlineInviteCustomCss}` }}'));
});

test('LINE repairs legacy role records via the unified role migration, not sender rules', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/line/LineConversationView.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('runLineStorageMigrations()'));
  assert.ok(source.includes('normalizeLineMessage(item, index)'));
  assert.ok(!source.includes('line:fix-ai-reply-sender-v2'));
  assert.ok(!source.includes('line:fix-user-sender-v1'));
  assert.ok(!source.includes("normalizeAiReplySender"));
});

test('normalizeLineMessage translates legacy sender to role and drops sender/type', () => {
  const user = normalizeLineMessage({ id: 1, sender: 'me', type: 'text', text: 'hi' });
  assert.equal(user.role, 'user');
  assert.equal(user.kind, 'text');
  assert.ok(!('sender' in user));
  assert.ok(!('type' in user));
  const assistant = normalizeLineMessage({ id: 2, sender: 'other', type: 'ai-reply', text: 'hello' });
  assert.equal(assistant.role, 'assistant');
  assert.equal(assistant.kind, 'ai-reply');
  const system = normalizeLineMessage({ id: 3, sender: 'system', kind: 'system', text: 'sys' });
  assert.equal(system.role, 'system');
  const explicit = normalizeLineMessage({ id: 4, role: 'user', sender: 'other', kind: 'text', text: 'mine' });
  assert.equal(explicit.role, 'user');
});

test('identity prefixes use colon and NPC conversation keys stay bare-normalized', () => {
  assert.equal(withCharPrefix('abc'), 'char:abc');
  assert.equal(withCharPrefix('char-abc'), 'char:abc');
  assert.equal(withCharPrefix('char:abc'), 'char:abc');
  assert.equal(withNpcPrefix('xyz'), 'npc:xyz');
  assert.equal(withNpcPrefix('npc-xyz'), 'npc:xyz');
  assert.equal(withNpcPrefix('npc:xyz'), 'npc:xyz');
  assert.equal(bareIdentityId('char:abc'), 'abc');
  assert.equal(bareIdentityId('npc-xyz'), 'xyz');
  assert.equal(npcConversationId('npc:xyz', 'p1'), 'npc:xyz:persona:p1');
  assert.equal(npcConversationId('npc-xyz', 'p1'), 'npc:xyz:persona:p1');
  assert.equal(npcConversationId('xyz'), 'npc:xyz:persona:legacy');
});

