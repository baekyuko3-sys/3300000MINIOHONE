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

export default defineConfig(() => {
  return {
    // GitHub Pages serves this project from /333oookkkkkkkkk/.
    // Vercel keeps the normal root path.
    base: process.env.GITHUB_ACTIONS === 'true' ? '/333oookkkkkkkkk/' : '/',
    plugins: [react(), tailwindcss(), neteaseImageProxy()],
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
