import test from 'node:test';
import assert from 'node:assert/strict';
import { isLineMessageFromUser } from '../src/store/lineRuntime.ts';

test('LINE aligns explicit user sender markers to the right', () => {
  assert.equal(isLineMessageFromUser({ sender: 'me' }), true);
  assert.equal(isLineMessageFromUser({ sender: 'user' }), true);
  assert.equal(isLineMessageFromUser({ sender: 'me', senderType: 'user', characterId: 'chat-character' }), true);
});

test('LINE keeps explicit incoming character and NPC messages on the left', () => {
  assert.equal(isLineMessageFromUser({ sender: 'other' }), false);
  assert.equal(isLineMessageFromUser({ sender: 'me', senderType: 'character' }), false);
  assert.equal(isLineMessageFromUser({ sender: 'me', senderType: 'npc' }), false);
  assert.equal(isLineMessageFromUser({ sender: 'me', type: 'ai-reply' }), false);
  assert.equal(isLineMessageFromUser({ sender: 'me', metadata: { characterId: 'npc-1' } }), true);
});

test('legacy sender display names do not override explicit user identity', () => {
  assert.equal(isLineMessageFromUser({ sender: 'me', senderType: 'user', senderName: '程凛' }, '程凛'), true);
  assert.equal(isLineMessageFromUser({ sender: 'me', senderName: '程凛' }, '程凛'), false);
  assert.equal(isLineMessageFromUser({ sender: 'other', senderName: '我' }, '程凛'), false);
});

test('LINE bubble wrapper preserves its original width and alignment classes', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/line/LineConversationView.tsx', import.meta.url), 'utf8');
  assert.match(source, /className=\{\`min-w-0 flex flex-col \$\{isGroup && !isMe \?/);
  assert.ok(source.includes("'max-w-[78%] relative touch-pan-y select-none ' + (isMe ? 'items-end' : 'items-start')"));
  assert.ok(source.includes('line-message-row w-full flex flex-nowrap items-end gap-2 transition-transform'));
  assert.ok(source.includes('line-message-row--me justify-end'));
  assert.ok(source.includes('line-message-row--other justify-start'));
  assert.ok(!source.includes("isMe ? 'ml-auto ' : ''"));
  assert.ok(!source.includes("style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end'"));
  assert.ok(source.includes('w-fit max-w-full rounded-[16px] px-3 py-1.5 text-[13px] leading-[1.5] whitespace-pre-wrap break-words select-text'));
});

test('LINE outgoing message uses its single existing optional avatar after the bubble', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/line/LineConversationView.tsx', import.meta.url), 'utf8');
  const rowStart = source.indexOf('w-full flex flex-nowrap items-end gap-2 transition-transform');
  const bubbleContainer = source.indexOf('{/* Bubble content container */}', rowStart);
  const existingAvatar = source.indexOf('{/* Optional user avatar */}', bubbleContainer);
  const rowEnd = source.indexOf('{/* Timestamp belongs below the message bubble', existingAvatar);
  assert.ok(rowStart >= 0 && bubbleContainer > rowStart && existingAvatar > bubbleContainer && rowEnd > existingAvatar);
  assert.match(source.slice(existingAvatar, rowEnd), /\{isMe && showMyAvatar &&/);
  assert.equal(source.split('自己的头像：放在消息气泡右侧').length - 1, 0);
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
