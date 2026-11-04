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

test('LINE bubble content wrapper keeps the original bubble width and alignment classes', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/line/LineConversationView.tsx', import.meta.url), 'utf8');
  assert.match(source, /className=\{\`min-w-0 flex flex-col \$\{isMe \? 'order-1 ' : ''\}/);
  assert.ok(source.includes("'max-w-[78%] relative touch-pan-y select-none ' + (isMe ? 'items-end' : 'items-start')"));
  assert.ok(source.includes('w-full flex flex-nowrap items-end gap-2 transition-transform'));
  assert.ok(source.includes('w-fit max-w-full rounded-[16px] px-3 py-1.5 text-[13px] leading-[1.5] whitespace-pre-wrap break-words select-text'));
});

test('LINE outgoing avatar is placed after the bubble without changing bubble styles', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/line/LineConversationView.tsx', import.meta.url), 'utf8');
  const rowStart = source.indexOf('w-full flex flex-nowrap items-end gap-2 transition-transform');
  const outgoingAvatar = source.indexOf('{/* 自己的头像：放在消息气泡右侧；只调整排列，不触碰气泡样式 */}', rowStart);
  const bubbleContainer = source.indexOf('{/* Bubble content container */}', outgoingAvatar);
  assert.ok(rowStart >= 0 && outgoingAvatar > rowStart && bubbleContainer > outgoingAvatar);
  assert.match(source.slice(outgoingAvatar, bubbleContainer), /\{isMe && !isEmptyAiPlaceholder &&/);
  assert.match(source.slice(outgoingAvatar, bubbleContainer), /order-2 w-\[31px\] h-\[31px\]/);
  assert.match(source.slice(bubbleContainer, bubbleContainer + 500), /isMe \? 'order-1 ' : ''/);
});
