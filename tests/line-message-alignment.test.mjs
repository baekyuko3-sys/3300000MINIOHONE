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

test('LINE bubble content wrapper is a flex column so side alignment classes take effect', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/line/LineConversationView.tsx', import.meta.url), 'utf8');
  assert.match(source, /className=\{\`min-w-0 flex flex-col \$\{isGroup && !isMe \?/);
  assert.ok(source.includes("'max-w-[78%] relative touch-pan-y select-none ' + (isMe ? 'items-end' : 'items-start')"));
});

test('LINE outgoing avatar stays inside the same horizontal row as its bubble', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/components/line/LineConversationView.tsx', import.meta.url), 'utf8');
  const rowStart = source.indexOf('w-full flex items-end gap-2 transition-transform');
  const outgoingAvatar = source.indexOf('{/* Optional user avatar */}', rowStart);
  const rowEnd = source.indexOf('{/* Timestamp belongs below the message bubble', outgoingAvatar);
  assert.ok(rowStart >= 0 && outgoingAvatar > rowStart && rowEnd > outgoingAvatar);
  assert.match(source.slice(outgoingAvatar, rowEnd), /\{isMe && showMyAvatar &&/);
  assert.match(source.slice(outgoingAvatar, rowEnd), /<\/div>\s*$/);
});
