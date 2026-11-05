import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCotOutputToSelectedPreset } from '../src/ai/aiEngine.ts';

test('custom COT labels containing regex punctuation are escaped before normalization', () => {
  const output = normalizeCotOutputToSelectedPreset(
    '【Plan.v2（高级）】old hidden reasoning<message>visible reply</message>',
    '【Plan.v2（高级）】',
    'selected summary',
  );
  assert.match(output, /【Plan\.v2（高级）】selected summary/);
  assert.match(output, /<message>visible reply<\/message>/);
  assert.doesNotMatch(output, /old hidden reasoning/);
});
