import test from 'node:test';
import assert from 'node:assert/strict';
import { listOpenAiCompatibleModels } from '../src/ai/aiEngine.ts';
import { pushAiDebugLog, writeAiDebugTrace } from '../src/store/aiDebug.ts';

const baseSettings = {
  apiKey: 'test-api-key-not-real',
  model: 'test-model',
  streaming: false,
  contextLength: 8,
  maxOutputTokens: 256,
  autoSave: true,
  temperature: 0.5,
  topP: 1,
  topK: 40,
  frequencyPenalty: 0,
  presencePenalty: 0,
  seed: null,
};

test('OpenAI-compatible model discovery surfaces upstream HTTP errors without hiding status', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'invalid test key' } }), { status: 401 });
  try {
    await assert.rejects(
      listOpenAiCompatibleModels({ ...baseSettings, provider: 'openai-compatible', apiBaseUrl: 'https://api.example.test/v1' }),
      /AI_MODELS_401/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini model discovery surfaces proxy HTTP errors cleanly', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input: String(input), init });
    if (String(input) === '/api/ai-models') {
      return new Response(JSON.stringify({ error: 'test proxy rejected request' }), { status: 403 });
    }
    return new Response(JSON.stringify({ models: [] }), { status: 200 });
  };
  try {
    await assert.rejects(
      listOpenAiCompatibleModels({ ...baseSettings, provider: 'gemini', apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta' }),
      /AI_MODELS_403/,
    );
    assert.ok(calls.some(call => call.input === '/api/ai-models'));
    const proxyCall = calls.find(call => call.input === '/api/ai-models');
    assert.equal(JSON.parse(proxyCall.init.body).provider, 'gemini');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI diagnostics redact API keys and bearer tokens before local persistence', () => {
  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    dispatchEvent() { return true; },
  };
  const googleKey = 'AIza' + 'A'.repeat(30);
  const bearer = 'Bearer ' + 'secret-token-123456789';
  pushAiDebugLog({
    level: 'error',
    event: 'redaction-test',
    message: 'request failed ' + bearer + ' apiKey=' + googleKey,
    meta: { apiKey: googleKey, detail: bearer },
  });
  writeAiDebugTrace({
    context: { conversationId: 'test' },
    error: { message: 'bad ' + googleKey, stack: 'Authorization: ' + bearer },
    rawResponse: 'echoed key ' + googleKey,
  });
  const log = storage.get('phone:ai-debug-log') || '';
  const trace = storage.get('phone:ai-debug-trace:test') || '';
  assert.doesNotMatch(log, /AIza[A-Z]{20,}|secret-token-123456789/);
  assert.doesNotMatch(trace, /AIza[A-Z]{20,}|secret-token-123456789/);
});
