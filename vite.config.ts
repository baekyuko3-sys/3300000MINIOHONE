import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import type {Plugin, Connect} from 'vite';
import http from 'http';

// Dev-only 图片代理：解决网易云 p1/p2/p3/p4.music.126.net 防盗链问题。
// 浏览器在 background-image 上无法控制 Referer 头，所以由这里去掉 Referer 反代一次。
function neteaseImageProxy(): Plugin {
  const ALLOW = /^https?:\/\/(p[1-4]|m[12]|m801)\.music\.126\.net\//i;
  return {
    name: 'netease-image-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__img', ((req: Connect.IncomingMessage, res: http.ServerResponse) => {
        try {
          const u = new URL(req.url || '/', 'http://x');
          const target = u.searchParams.get('u');
          if (!target || !ALLOW.test(target)) {
            res.statusCode = 400;
            res.end('bad target');
            return;
          }
          const upstream = http.request(target, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } }, upstreamRes => {
            res.statusCode = upstreamRes.statusCode || 502;
            if (upstreamRes.headers['content-type']) res.setHeader('Content-Type', upstreamRes.headers['content-type']);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('Access-Control-Allow-Origin', '*');
            upstreamRes.pipe(res);
          });
          upstream.on('error', () => { res.statusCode = 502; res.end('upstream error'); });
          upstream.end();
        } catch {
          res.statusCode = 500; res.end('proxy error');
        }
      }) as Connect.NextHandleFunction);
    },
  };
}

// Dev-only AI 代理：转发 /api/ai-models 到实际 AI 提供商，解决浏览器 CORS 问题。
function aiProxy(): Plugin {
  return {
    name: 'ai-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/ai-models', (async (req: Connect.IncomingMessage, res: http.ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405; res.end('Method not allowed'); return;
        }
        try {
          const body = await new Promise<string>((resolve, reject) => {
            let data = '';
            req.on('data', chunk => data += chunk);
            req.on('end', () => resolve(data));
            req.on('error', reject);
          });
          const { action, provider, baseUrl, apiKey, model, systemPrompt, userPrompt, history } = JSON.parse(body);

          if (action === 'models') {
            // 拉取模型列表
            const endpoint = (baseUrl || '').replace(/\/+$/, '') + '/models';
            const r = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${apiKey}` } });
            const data = await r.json();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return;
          }

          if (action === 'chat') {
            let endpoint: string;
            let headers: Record<string, string>;
            let reqBody: any;

            if (provider === 'gemini') {
              const base = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
              endpoint = `${base}/models/${encodeURIComponent(model)}:generateContent`;
              headers = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
              reqBody = {
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [
                  ...(history || []).map((m: any) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
                  { role: 'user', parts: [{ text: userPrompt }] },
                ],
              };
            } else {
              // OpenAI 兼容
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
            res.statusCode = r.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return;
          }

          res.statusCode = 400; res.end('Unknown action');
        } catch (e) {
          res.statusCode = 500; res.end('proxy error: ' + String(e));
        }
      }) as Connect.NextHandleFunction);
    },
  };
}

export default defineConfig(() => {
  return {
    // GitHub Pages serves this project from /333oookkkkkkkkk/.
    // Vercel keeps the normal root path.
    base: process.env.GITHUB_ACTIONS === 'true' ? '/3300000MINIOHONE/' : '/',
    plugins: [react(), tailwindcss(), neteaseImageProxy(), aiProxy()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
