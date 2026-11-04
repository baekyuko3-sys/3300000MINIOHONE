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
  assert.equal(isLineMessageFromUser({ sender: 'me', metadata: { characterId: 'npc-1' } }), false);
});

test('legacy sender display names do not override explicit user identity', () => {
  assert.equal(isLineMessageFromUser({ sender: 'me', senderType: 'user', senderName: '程凛' }, '程凛'), true);
  assert.equal(isLineMessageFromUser({ sender: 'me', senderName: '程凛' }, '程凛'), false);
  assert.equal(isLineMessageFromUser({ sender: 'other', senderName: '我' }, '程凛'), false);
});
