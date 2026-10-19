// Vercel serverless: /api/ai-models
// 转发 AI 请求到真实提供商，解决浏览器 CORS 问题
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end('Method not allowed');
    return;
  }

  try {
    const { action, provider, baseUrl, apiKey, model, systemPrompt, userPrompt, history } = req.body || {};

    if (action === 'models') {
      const endpoint = (baseUrl || '').replace(/\/+$/, '') + '/models';
      const r = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      const data = await r.json();
      res.status(r.status).json(data);
      return;
    }

    if (action === 'chat') {
      let endpoint;
      let headers;
      let reqBody;

      if (provider === 'gemini') {
        const base = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
        endpoint = `${base}/models/${encodeURIComponent(model)}:generateContent`;
        headers = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
        reqBody = {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            ...(history || []).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
            { role: 'user', parts: [{ text: userPrompt }] },
          ],
        };
      } else {
        const base = (baseUrl || '').replace(/\/+$/, '');
        endpoint = base.endsWith('/chat/completions') ? base : base + '/chat/completions';
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
        reqBody = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...(history || []),
            { role: 'user', content: userPrompt },
          ],
        };
      }

      const r = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(reqBody) });
      const data = await r.json();
      res.status(r.status).json(data);
      return;
    }

    res.status(400).end('Unknown action');
  } catch (e) {
    res.status(500).end('proxy error: ' + String(e));
  }
}
