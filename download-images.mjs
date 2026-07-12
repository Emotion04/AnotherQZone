// download-images.mjs — 把说说里的全部图片下载到 site/media 做永久存档。
// 下载后重新 build/serve，网页会自动改用本地图片（parse.mjs 检测本地文件即优先）。
// 用法：node download-images.mjs        （断点续传：已存在的文件自动跳过）
//      node download-images.mjs --force （强制重新下载）
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageFilename } from './parse.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FORCE = process.argv.includes('--force');
const CONCURRENCY = 8;

const jsonPath = join(__dirname, 'moods-all.json');
if (!existsSync(jsonPath)) { console.error('✗ 未找到 moods-all.json'); process.exit(1); }

const mediaDir = join(__dirname, 'site', 'media');
mkdirSync(mediaDir, { recursive: true });

// 收集所有图片 URL（去重）
const moods = JSON.parse(readFileSync(jsonPath, 'utf8'));
const urls = [];
const seen = new Set();
for (const m of moods) {
  for (const u of (Array.isArray(m.u) ? m.u : [])) {
    if (u && !seen.has(u)) { seen.add(u); urls.push(u); }
  }
}
console.log(`共 ${urls.length} 张图片，输出到 site/media/`);

let done = 0, skipped = 0, failed = 0;
const failures = [];

async function fetchOne(url) {
  const fn = imageFilename(url);
  const dest = join(mediaDir, fn);
  if (!FORCE && existsSync(dest) && statSync(dest).size > 0) { skipped++; return; }
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('空响应');
    writeFileSync(dest, buf);
    done++;
  } catch (e) {
    failed++; failures.push({ url, err: e.message });
  }
  const total = done + skipped + failed;
  if (total % 25 === 0 || total === urls.length) {
    process.stdout.write(`\r  进度 ${total}/${urls.length}  下载 ${done} · 跳过 ${skipped} · 失败 ${failed}   `);
  }
}

// 简单并发池
async function run() {
  let i = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (i < urls.length) { const idx = i++; await fetchOne(urls[idx]); }
  });
  await Promise.all(workers);
  console.log('\n');
  console.log(`✓ 完成：新下载 ${done} · 已存在 ${skipped} · 失败 ${failed}`);
  if (failures.length) {
    const logPath = join(__dirname, 'download-failures.json');
    writeFileSync(logPath, JSON.stringify(failures, null, 2));
    console.log(`  失败清单已写入 ${logPath}（可重跑本脚本续传）`);
  }
  console.log('  接着运行  node build.mjs  （或刷新 serve）即可让网页改用本地图片。');
}

run();
