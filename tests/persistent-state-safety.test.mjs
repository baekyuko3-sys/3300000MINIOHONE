import test from 'node:test';
import assert from 'node:assert/strict';
import { isPersistentStorageReadSafe } from '../src/store/usePersistentState.ts';

test('missing persistent keys may be initialized', () => {
  assert.equal(isPersistentStorageReadSafe(null), true);
});

test('valid JSON persistent values may be safely read and rewritten', () => {
  assert.equal(isPersistentStorageReadSafe('{"saved":true}'), true);
  assert.equal(isPersistentStorageReadSafe('null'), true);
  assert.equal(isPersistentStorageReadSafe('[]'), true);
});

test('malformed JSON persistent values block fallback writes', () => {
  assert.equal(isPersistentStorageReadSafe('{broken'), false);
  assert.equal(isPersistentStorageReadSafe(''), false);
});

test('storage read exceptions block fallback writes even without raw bytes', () => {
  assert.equal(isPersistentStorageReadSafe(null, true), false);
});
