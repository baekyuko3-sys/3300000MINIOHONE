export const config = {
  maxDuration: 60,
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type Body = {
  action?: 'models' | 'chat';
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
  history?: ChatMessage[];
};

const corsHeaders = {
  // This endpoint is same-origin for the Vercel app. Do not expose a wildcard
  // CORS policy that lets arbitrary websites use it as an AI proxy.
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const DEFAULT_ALLOWED_HOSTS = new Set([
  'generativelanguage.googleapis.com',
  'api.openai.com',
  'api.deepseek.com',
  'api.siliconflow.cn',
  'api.moonshot.cn',
  'dashscope.aliyuncs.com',
  'api.minimax.chat',
  'api.minimaxi.com',
  'openrouter.ai',
  'api.groq.com',
  'api.together.xyz',
  'api.mistral.ai',
  'api.perplexity.ai',
  'api.x.ai',
  'api.lingyiwanwu.com',
  'api.stepfun.com',
]);

function validateBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid API base URL');
  }
  if (parsed.protocol !== 'https:') throw new Error('AI proxy only allows HTTPS upstream URLs');
  if (parsed.port && parsed.port !== '443') throw new Error('AI proxy only allows the standard HTTPS port');
  if (parsed.username || parsed.password) throw new Error('Credentials must not be embedded in the API base URL');
  if (parsed.search || parsed.hash) throw new Error('API base URL must not include query parameters or a fragment');

  const runtime = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
  const configuredHosts = String(runtime.process?.env?.AI_PROXY_ALLOWED_HOSTS || '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean);
  const allowedHosts = new Set([...DEFAULT_ALLOWED_HOSTS, ...configuredHosts]);
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error('API host is not allowed by the server proxy. Add its exact hostname to AI_PROXY_ALLOWED_HOSTS in Vercel if you trust this provider.');
  }
  return cleanBaseUrl(parsed.toString());
}

const upstreamTimers = new WeakMap<Response, ReturnType<typeof setTimeout>>();

async function fetchUpstream(input: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(input, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    });
    // Keep the deadline active after headers arrive; upstreamJson still has to
    // consume the response body, which can otherwise hang indefinitely.
    upstreamTimers.set(response, timer);
    return response;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, ...extra },
  });
}

function cleanBaseUrl(value: string) {
  return value
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/models$/i, '')
    .replace(/\/+$/, '');
}

async function upstreamJson(response: Response) {
  try {
    const text = await response.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text || response.statusText || 'Upstream returned invalid JSON' };
    }
    return json(data, response.status, {
      'Content-Type': response.headers.get('content-type') || 'application/json',
    });
  } finally {
    const timer = upstreamTimers.get(response);
    if (timer) clearTimeout(timer);
    upstreamTimers.delete(response);
  }
}

async function readBoundedJson(request: Request, maxBytes = 512 * 1024): Promise<Body> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw new Error('Request body exceeds the 512 KB limit');
  if (!request.body) throw new Error('Request body is required');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Request body exceeds the 512 KB limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes)) as Body;
}

function validateRequestBody(body: Body, provider: string) {
  if (provider !== 'gemini' && provider !== 'openai-compatible') throw new Error('Unsupported AI provider');
  const fields: Array<[string, unknown, number]> = [
    ['API key', body.apiKey, 4096],
    ['API base URL', body.baseUrl, 2048],
    ['Model', body.model, 256],
    ['System prompt', body.systemPrompt, 80_000],
    ['User prompt', body.userPrompt, 80_000],
  ];
  for (const [label, value, limit] of fields) {
    if (value != null && String(value).length > limit) throw new Error(label + ' exceeds the allowed length');
  }
  if (body.history != null) {
    if (!Array.isArray(body.history) || body.history.length > 40) throw new Error('History must contain at most 40 messages');
    for (const message of body.history) {
      if (!message || (message.role !== 'user' && message.role !== 'assistant') || typeof message.content !== 'string' || message.content.length > 20_000) {
        throw new Error('History contains an invalid or oversized message');
      }
    }
  }
}

async function handleRequest(request: Request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const body = await readBoundedJson(request);
    const provider = String(body.provider || 'openai-compatible');
    validateRequestBody(body, provider);
    const apiKey = String(body.apiKey || '').trim();
    const rawBaseUrl = cleanBaseUrl(String(body.baseUrl || ''));

    if (!apiKey) return json({ error: 'API key is required' }, 400);
    if (!rawBaseUrl) return json({ error: 'API base URL is required' }, 400);
    const baseUrl = validateBaseUrl(rawBaseUrl);

    if (body.action === 'models') {
      const response = await fetchUpstream(
        provider === 'gemini' ? baseUrl + '/models' : baseUrl + '/models',
        {
          method: 'GET',
          headers: provider === 'gemini'
            ? { Accept: 'application/json', 'x-goog-api-key': apiKey }
            : { Accept: 'application/json', Authorization: 'Bearer ' + apiKey },
        },
      );
      return upstreamJson(response);
    }

    if (body.action !== 'chat') {
      return json({ error: 'Unsupported action. Use models or chat.' }, 400);
    }

    const model = String(body.model || '').trim();
    if (!model) return json({ error: 'Model is required' }, 400);

    if (provider === 'gemini') {
      const response = await fetchUpstream(
        baseUrl + '/models/' + encodeURIComponent(model) + ':generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: String(body.systemPrompt || '') }] },
            contents: [
              ...(body.history || []).map(message => ({
                role: message.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: String(message.content || '') }],
              })),
              { role: 'user', parts: [{ text: String(body.userPrompt || '') }] },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 5000,
            },
          }),
        },
      );
      return upstreamJson(response);
    }

    const response = await fetchUpstream(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.2,
        max_tokens: 5000,
        messages: [
          { role: 'system', content: String(body.systemPrompt || '') },
          ...(body.history || []),
          { role: 'user', content: String(body.userPrompt || '') },
        ],
      }),
    });
    return upstreamJson(response);
  } catch (error) {
    const timedOut = Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
    return json({
      error: timedOut ? 'AI upstream request timed out after 25 seconds' : error instanceof Error ? error.message : 'AI proxy request failed',
    }, timedOut ? 504 : 502);
  }
}

export default async function handler(request: Request) {
  return handleRequest(request);
}
