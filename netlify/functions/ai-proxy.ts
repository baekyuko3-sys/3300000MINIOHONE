export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405, headers });
  }

  try {
    const body = await request.json() as {
      action?: string;
      baseUrl?: string;
      apiKey?: string;
      provider?: string;
      model?: string;
      systemPrompt?: string;
      userPrompt?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (body.action !== 'models' && body.action !== 'chat') {
      return new Response(JSON.stringify({ error: 'Unsupported action' }), { status: 400, headers });
    }

    const apiKey = String(body.apiKey || '').trim();
    let baseUrl = String(body.baseUrl || '').trim().replace(/\/+$/, '');
    if (!apiKey || !baseUrl) {
      return new Response(JSON.stringify({ error: 'baseUrl and apiKey are required' }), { status: 400, headers });
    }

    baseUrl = baseUrl
      .replace(/\/chat\/completions$/i, '')
      .replace(/\/responses$/i, '')
      .replace(/\/models$/i, '')
      .replace(/\/+$/, '');

    if (body.action === 'chat') {
      const provider = String(body.provider || 'openai-compatible');
      const model = String(body.model || '').trim();
      if (!model) return new Response(JSON.stringify({ error: 'model is required' }), { status: 400, headers });

      if (provider === 'gemini') {
        const actionUrl = baseUrl + '/models/' + encodeURIComponent(model) + ':generateContent';
        const upstream = await fetch(actionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: String(body.systemPrompt || '') }] },
            contents: [
              ...(body.history || []).map(message => ({
                role: message.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: String(message.content || '') }],
              })),
              { role: 'user', parts: [{ text: String(body.userPrompt || '') }] },
            ],
            generationConfig: { temperature: 0.2, maxOutputTokens: 5000 },
          }),
        });
        const text = await upstream.text();
        return new Response(text || '{}', {
          status: upstream.status,
          headers: { ...headers, 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
        });
      }

      const upstream = await fetch(baseUrl + '/chat/completions', {
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
      const text = await upstream.text();
      return new Response(text || '{}', {
        status: upstream.status,
        headers: { ...headers, 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
      });
    }

    const upstream = await fetch(baseUrl + '/models', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
    });

    const text = await upstream.text();
    return new Response(text || '{}', {
      status: upstream.status,
      headers: {
        ...headers,
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Proxy request failed',
    }), { status: 502, headers });
  }
}
