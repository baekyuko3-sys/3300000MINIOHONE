import test from 'node:test';
import assert from 'node:assert/strict';
import { listOpenAiCompatibleModels, generateCreativeText } from '../src/ai/aiEngine.ts';
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
  globalThis.window = { setTimeout, clearTimeout };
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
  globalThis.window = { setTimeout, clearTimeout };
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
    context: { conversationId: 'test', userMessage: 'user pasted ' + googleKey },
    error: { message: 'bad ' + googleKey, stack: 'Authorization: ' + bearer },
    parsed: { text: 'model echoed ' + googleKey },
    final: { apiKey: googleKey },
    rawResponse: 'echoed key ' + googleKey,
  });
  const log = storage.get('phone:ai-debug-log') || '';
  const trace = storage.get('phone:ai-debug-trace:test') || '';
  assert.doesNotMatch(log, /AIza[A-Z]{20,}|secret-token-123456789/);
  assert.doesNotMatch(trace, /AIza[A-Z]{20,}|secret-token-123456789/);
  assert.match(trace, /REDACTED/);
});


test('creative text requests are bounded to the serverless proxy contract', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.window = { setTimeout, clearTimeout };
  let captured;
  globalThis.fetch = async (input, init = {}) => {
    assert.equal(String(input), '/api/ai-models');
    captured = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
  };
  try {
    const history = Array.from({ length: 50 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: String(index) + ':' + 'x'.repeat(20000),
    }));
    const result = await generateCreativeText({
      settings: { ...baseSettings, provider: 'openai-compatible', apiBaseUrl: 'https://api.openai.com/v1' },
      systemPrompt: 's'.repeat(100000),
      userPrompt: 'u'.repeat(100000),
      history,
    });
    assert.equal(result, 'ok');
    assert.equal(captured.history.length, 30);
    assert.ok(captured.history.every(message => message.content.length <= 8000));
    assert.equal(captured.systemPrompt.length, 80000);
    assert.equal(captured.userPrompt.length, 80000);
    assert.ok(new TextEncoder().encode(JSON.stringify(captured)).byteLength < 512 * 1024);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
