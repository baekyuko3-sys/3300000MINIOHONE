import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/ai-models.ts';

test('AI proxy refuses unapproved upstream hosts before making a network request', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response('{}', { status: 200 });
  };
  try {
    const response = await handler(new Request('https://app.example.test/api/ai-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'models',
        provider: 'openai-compatible',
        apiKey: 'test-only-key',
        baseUrl: 'https://attacker.example.test/v1',
      }),
    }));
    assert.equal(response.status, 502);
    assert.equal(called, false);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI proxy rejects oversized request bodies before upstream fetch', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response('{}', { status: 200 });
  };
  try {
    const response = await handler(new Request('https://app.example.test/api/ai-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'chat',
        provider: 'openai-compatible',
        apiKey: 'test-only-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'test-model',
        userPrompt: 'x'.repeat(520 * 1024),
      }),
    }));
    assert.equal(response.status, 502);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI proxy disables redirects when calling an approved upstream', async () => {
  const originalFetch = globalThis.fetch;
  let redirectMode = '';
  globalThis.fetch = async (_input, init = {}) => {
    redirectMode = String(init.redirect || '');
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };
  try {
    const response = await handler(new Request('https://app.example.test/api/ai-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'models',
        provider: 'openai-compatible',
        apiKey: 'test-only-key',
        baseUrl: 'https://api.openai.com/v1',
      }),
    }));
    assert.equal(response.status, 200);
    assert.equal(redirectMode, 'error');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
