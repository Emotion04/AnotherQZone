// build.mjs — 把 blogs-ai/ 与 moods-ai/ 解析并写入 site/data.js
// 用法：node build.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAll, warnings } from './parse.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function build() {
  const data = parseAll(__dirname);
  data.generatedAt = new Date().toISOString();
  const outDir = join(__dirname, 'site');
  mkdirSync(outDir, { recursive: true });
  const js = `/* 自动生成，请勿手改。运行 node build.mjs 重新生成。 */\nwindow.__ARCHIVE__ = ${JSON.stringify(data)};\n`;
  writeFileSync(join(outDir, 'data.js'), js, 'utf8');
  const { stats } = data;
  console.log('✓ 已生成 site/data.js');
  console.log(`  说说 ${stats.totalMoods} 条 · 日志 ${stats.totalBlogs} 篇 · 图片 ${stats.totalImages} 张 · 文字 ${stats.totalWords} 字`);
  console.log(`  时间跨度 ${stats.firstDate} → ${stats.lastDate}（${stats.spanYears} 年）`);
  if (warnings.length) {
    console.log('\n  ⚠ 告警：');
    warnings.forEach((w) => console.log('    · ' + w));
  }
}

build();
