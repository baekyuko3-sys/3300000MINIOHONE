import test from 'node:test';
import assert from 'node:assert/strict';
import { isLineTurnContextCurrent, releaseLineTypingRequest } from '../src/store/lineTurnGuard.ts';

test('LINE send and Reroll contexts become stale when chat or persona changes', () => {
  const started = { conversationId: 'chat-a', personaId: 'persona-a' };
  assert.equal(isLineTurnContextCurrent({ ...started }, started), true);
  assert.equal(isLineTurnContextCurrent({ conversationId: 'chat-b', personaId: 'persona-a' }, started), false);
  assert.equal(isLineTurnContextCurrent({ conversationId: 'chat-a', personaId: 'persona-b' }, started), false);
});

test('a stale LINE request cannot clear the typing indicator owned by a newer request', () => {
  const owner = { current: 'new-request' };
  let typing = true;
  let resetCount = 0;
  const released = releaseLineTypingRequest(owner, 'old-request', value => { typing = value; }, () => { resetCount += 1; });
  assert.equal(released, false);
  assert.equal(owner.current, 'new-request');
  assert.equal(typing, true);
  assert.equal(resetCount, 0);
});

test('the current LINE request clears its own typing indicator', () => {
  const owner = { current: 'current-request' };
  let typing = true;
  let resetCount = 0;
  const released = releaseLineTypingRequest(owner, 'current-request', value => { typing = value; }, () => { resetCount += 1; });
  assert.equal(released, true);
  assert.equal(owner.current, '');
  assert.equal(typing, false);
  assert.equal(resetCount, 1);
});
