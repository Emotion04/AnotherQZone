// serve.mjs — 本地服务器。每次请求 data.js 都重新解析源文件，
// 实现"更新数据 → 刷新页面即同步"。用法：node serve.mjs [端口]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAll } from './parse.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = join(__dirname, 'site');
const PORT = Number(process.argv[2]) || 4321;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/index.html';

  // 动态数据：实时解析
  if (url === '/data.js') {
    try {
      const data = parseAll(__dirname);
      data.generatedAt = new Date().toISOString();
      const js = `window.__ARCHIVE__ = ${JSON.stringify(data)};\n`;
      res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
      res.end(js);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('解析失败: ' + e.message);
    }
    return;
  }

  // 静态文件（限定在 site/ 内）
  const filePath = normalize(join(SITE, url));
  if (!filePath.startsWith(SITE)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(filePath));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, () => {
  const { stats } = parseAll(__dirname);
  console.log('\n  珍藏数字信息馆 · 本地服务器已启动');
  console.log(`  ▸ http://localhost:${PORT}`);
  console.log(`  ▸ 说说 ${stats.totalMoods} 条 · 日志 ${stats.totalBlogs} 篇`);
  console.log('  ▸ 更新 moods-ai/ 或 blogs-ai/ 后，刷新页面即可同步\n');
});
