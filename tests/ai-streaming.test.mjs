import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSseResponse, readError } from '../src/ai/streaming.ts';

const extractOpenAiText = data => (data?.choices || [])
  .map(choice => choice?.delta?.content || '')
  .join('');

test('SSE parser streams deltas and stops cleanly at the DONE marker', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
    'data: [DONE]\n\n',
  ];
  const response = new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }));
  const deltas = [];
  const result = await parseSseResponse(response, extractOpenAiText, delta => deltas.push(delta));
  assert.equal(result, 'Hello world');
  assert.deepEqual(deltas, ['Hello ', 'world']);
});

test('SSE parser exposes provider error events instead of returning an empty reply', async () => {
  const response = new Response('data: {"error":{"message":"quota exceeded"}}\n\n');
  await assert.rejects(
    parseSseResponse(response, extractOpenAiText),
    /AI_STREAM_PROVIDER_ERROR: quota exceeded/,
  );
});

test('SSE idle timeout cancels the stalled stream and releases its reader', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    pull() { return new Promise(() => {}); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(parseSseResponse(response, extractOpenAiText, undefined, 10), /AI_STREAM_TIMEOUT/);
  assert.equal(cancelled, true);
});

test('readError preserves plain-text provider errors when the body is not JSON', async () => {
  const response = new Response('upstream gateway is temporarily unavailable', {
    status: 502,
    statusText: 'Bad Gateway',
  });
  const message = await readError(response);
  assert.match(message, /502 Bad Gateway/);
  assert.match(message, /upstream gateway is temporarily unavailable/);
});

test('readError extracts structured provider error codes and messages', async () => {
  const response = new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: 'Key rejected' } }), {
    status: 401,
    statusText: 'Unauthorized',
    headers: { 'Content-Type': 'application/json' },
  });
  const message = await readError(response);
  assert.match(message, /code=invalid_api_key/);
  assert.match(message, /Key rejected/);
});
