// parse.mjs — 零依赖数据解析器
// 说说来自 moods-all.json（结构化：文本+时间戳+图片URL），日志来自 blogs-ai/*.md。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// 构建期收集的告警，供 build.mjs 打印
export const warnings = [];
const warn = (msg) => { warnings.push(msg); };

// 图片 URL → 本地存档文件名（download-images.mjs 与解析器共用同一命名）
export function imageFilename(url) {
  return createHash('md5').update(url).digest('hex').slice(0, 20) + '.jpg';
}

// ---------- 工具 ----------

// 解码 HTML 实体（文件名/标题里可能有 &#8226; 之类）
function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

const pad2 = (n) => String(n).padStart(2, '0');

// 把 "2022-8-11" / "2022-8-11 22:41" 规整为 {date:'2022-08-11', time:'22:41'}
function normalizeDate(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return {
    date: `${y}-${pad2(mo)}-${pad2(d)}`,
    time: h != null ? `${pad2(h)}:${mi}` : null,
    year: Number(y),
    month: Number(mo),
  };
}

function stripFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([\w-]+):\s*(.*)$/);
    if (mm) meta[mm[1]] = mm[2].trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

// ---------- 说说（moods） ----------

// 清洗 QQ 表情码 [em]eXXXX[/em] 与多余空白
function cleanMoodText(s) {
  if (!s) return '';
  return decodeEntities(
    String(s)
      .replace(/\[em\]e?\d+\[\/em\]/gi, '') // 去表情码
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
  ).trim();
}

// ts(秒) → 北京时间(UTC+8)，与机器所在时区无关
function tsToBeijing(ts) {
  const d = new Date((Number(ts) + 8 * 3600) * 1000);
  const p = (n) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, da = d.getUTCDate();
  return {
    date: `${y}-${p(mo)}-${p(da)}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
    year: y, month: mo,
  };
}

// 首选：moods-all.json；否则示例数据 moods-all.sample.json；再否则回退 moods-ai/ markdown
function parseMoods(root) {
  const real = join(root, 'moods-all.json');
  const sample = join(root, 'moods-all.sample.json');
  const jsonPath = existsSync(real) ? real : existsSync(sample) ? sample : null;
  if (jsonPath) {
    let raw;
    try { raw = JSON.parse(readFileSync(jsonPath, 'utf8')); }
    catch (e) { warn(`${jsonPath} 解析失败：${e.message}`); raw = null; }
    if (jsonPath === sample) warn('未找到 moods-all.json，正在使用示例数据 moods-all.sample.json');
    if (Array.isArray(raw)) return parseMoodsJson(raw, root);
    warn('说说 JSON 结构异常（期望数组），已回退到 markdown');
  } else {
    warn('未找到 moods-all.json / 示例数据，使用 moods-ai/ markdown');
  }
  return parseMoodsMarkdown(join(root, 'moods-ai'));
}

function parseMoodsJson(arr, root) {
  const mediaDir = join(root, 'site', 'media');
  const out = [];
  let skipped = 0;
  for (const it of arr) {
    if (!it || it.ts == null) { skipped++; continue; }
    const nd = tsToBeijing(it.ts);
    const urls = Array.isArray(it.u) ? it.u.filter(Boolean) : [];
    // 本地存档优先：若 site/media/<hash>.jpg 已存在则用本地相对路径
    const images = urls.map((url) => {
      const fn = imageFilename(url);
      return existsSync(join(mediaDir, fn)) ? `media/${fn}` : url;
    });
    out.push({
      id: `mood-${nd.date}-${out.length}`,
      type: 'mood',
      date: nd.date,
      time: nd.time,
      ts: Number(it.ts),
      year: nd.year,
      month: nd.month,
      text: cleanMoodText(it.c),
      images,          // 图片地址数组（本地或远程）
      imageCount: images.length,
    });
  }
  if (skipped) warn(`说说 JSON 跳过 ${skipped} 条缺时间戳的记录`);
  if (!out.length) warn('说说 JSON 解析到 0 条，请检查数据源');
  out.sort((a, b) => b.ts - a.ts);
  return out;
}

function parseMoodsMarkdown(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  const isEntryHead = (l) => /^\s*-\s+\*\*\d{4}-\d{2}-\d{2}\*\*/.test(l);
  const isBoundary = (l) => isEntryHead(l) || /^#{1,6}\s/.test(l) || /^---\s*$/.test(l);

  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');
    const { body } = stripFrontmatter(text);
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*-\s+\*\*(\d{4}-\d{2}-\d{2})\*\*(?:\s*\[图片×(\d+)\])?(?::\s*(.*))?\s*$/);
      if (!m) continue;
      const [, date, imgs, inline] = m;
      const cont = [];
      let j = i + 1;
      for (; j < lines.length && !isBoundary(lines[j]); j++) cont.push(lines[j]);
      i = j - 1;
      const paras = [];
      let buf = [];
      for (const raw of cont) {
        const s = raw.trim();
        if (!s || /^\(无文字\)$/.test(s)) { if (buf.length) { paras.push(buf.join('')); buf = []; } continue; }
        buf.push(s);
      }
      if (buf.length) paras.push(buf.join(''));
      const parts = [];
      if (inline != null && inline.trim()) parts.push(inline.trim());
      if (paras.length) parts.push(paras.join('\n'));
      const nd = normalizeDate(date);
      const n = imgs ? Number(imgs) : 0;
      out.push({
        id: `mood-${date}-${out.length}`,
        type: 'mood',
        date, time: null, ts: 0,
        year: nd.year, month: nd.month,
        text: decodeEntities(parts.join('\n').trim()),
        images: [],        // markdown 版没有图片 URL
        imageCount: n,
      });
    }
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

// ---------- 日志（blogs） ----------

// 整行即样板、需要在正文中剔除的行
const BOILERPLATE_EXACT = new Set([
  '赞', '转载', '分享', '复制地址', '编辑', '收藏', '举报',
  '显示评论签名', '显示评论', '设置',
]);
function isBoilerplateLine(t) {
  const s = t.trim();
  if (!s) return false;
  if (BOILERPLATE_EXACT.has(s)) return true;
  if (/^评论(\(\d+\))?$/.test(s)) return true;
  if (/^上一篇/.test(s) || /^下一篇/.test(s)) return true;
  if (/^阅读(全文)?$/.test(s)) return true;
  return false;
}

// 标记正文结束（页脚开始）的行
function isFooterMarker(t) {
  const s = t.trim();
  if (/\|\s*(公开|私密|好友|仅.*可见).*原创/.test(s)) return true; // 分类|公开|原创：X
  if (/^签名档/.test(s)) return true;
  if (/^我的热评日志/.test(s)) return true;
  if (/^本文最近访客/.test(s)) return true;
  if (/^查看最近/.test(s)) return true;
  if (/^发表评论/.test(s)) return true;
  return false;
}

// 从页脚区域尽力解析评论
function parseComments(lines, start) {
  const comments = [];
  for (let i = start; i < lines.length; i++) {
    const m = lines[i].match(/^(\d+)楼\s+评论时间[:：]\s*(.+)$/);
    if (!m) continue;
    // 楼层号上一非空行作为评论者
    let author = '';
    for (let j = i - 1; j >= start; j--) {
      const s = lines[j].trim();
      if (!s) continue;
      if (s === '显示评论签名' || /^评论(\(\d+\))?$/.test(s)) break;
      author = s;
      break;
    }
    // 收集评论正文
    const textLines = [];
    for (let k = i + 1; k < lines.length; k++) {
      const s = lines[k].trim();
      if (s === '回复') continue;
      if (!s) continue;
      if (/^-{3,}$/.test(s)) break;
      if (/^该评论来自/.test(s)) break;
      if (/^\d+楼\s+评论时间/.test(s)) break;
      if (/^上一页/.test(s) || /^转到\s*页/.test(s)) break;
      textLines.push(s);
    }
    comments.push({
      floor: Number(m[1]),
      author: decodeEntities(author),
      time: m[2].trim(),
      text: decodeEntities(textLines.join('\n')),
    });
  }
  return comments;
}

// 从页脚区域尽力解析访客（本文最近访客：姓名 + "YYYY年M月"）
function parseVisitors(lines, start) {
  const visitors = [];
  const seen = new Set();
  for (let i = start; i < lines.length; i++) {
    if (/^\d+楼\s+评论时间/.test(lines[i]) || /^发表评论/.test(lines[i])) break; // 到评论区停止
    const dm = lines[i].trim().match(/^(\d{4})年(\d{1,2})月$/);
    if (!dm) continue;
    let name = '';
    for (let j = i - 1; j >= start; j--) {
      const s = lines[j].trim();
      if (!s) continue;
      if (/访客|设置|查看最近|签名档|热评|评论/.test(s)) break;
      name = s;
      break;
    }
    if (!name) continue;
    const key = name + dm[1] + dm[2];
    if (seen.has(key)) continue;
    seen.add(key);
    visitors.push({ name: decodeEntities(name), date: `${dm[1]}年${dm[2]}月` });
  }
  return visitors;
}

function titleFromFilename(file) {
  // 2025-3-26 18-41 随笔.md  ->  随笔
  let name = file.replace(/\.md$/i, '');
  name = name.replace(/^\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}-\d{2}\s+/, '');
  return decodeEntities(name).trim();
}

function parseBlogs(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');
    const { meta, body } = stripFrontmatter(text);
    const lines = body.split('\n');

    // 标题
    let titleIdx = lines.findIndex((l) => /^#\s+/.test(l));
    let title = titleIdx >= 0 ? decodeEntities(lines[titleIdx].replace(/^#\s+/, '').trim()) : '';
    if (!title) title = titleFromFilename(file);

    // 日期：优先 frontmatter，回退文件名
    let nd = normalizeDate(meta.date);
    if (!nd) {
      const fm = file.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2})-(\d{2})/);
      if (fm) nd = normalizeDate(`${fm[1]}-${fm[2]}-${fm[3]} ${fm[4]}:${fm[5]}`);
    }
    if (!nd) nd = { date: '0000-00-00', time: null, year: 0, month: 0 };

    // 找页脚起点
    let footerStart = lines.length;
    for (let i = (titleIdx >= 0 ? titleIdx + 1 : 0); i < lines.length; i++) {
      if (isFooterMarker(lines[i])) { footerStart = i; break; }
    }

    // 提取分类 / 原创作者
    let category = '', author = '';
    const metaLine = lines.slice(0, lines.length).find((l) => /\|.*原创/.test(l));
    if (metaLine) {
      const parts = metaLine.split('|').map((s) => s.trim());
      category = decodeEntities(parts[0] || '');
      const am = metaLine.match(/原创[:：]\s*(.+)$/);
      if (am) author = decodeEntities(am[1].trim());
    }

    // 正文：标题之后到页脚之前，去样板、修剪空行
    const rawBody = lines.slice(titleIdx >= 0 ? titleIdx + 1 : 0, footerStart);
    const blocks = [];
    for (const l of rawBody) {
      const s = l.replace(/\s+$/, '');
      if (isBoilerplateLine(s)) continue;
      if (/^#+\s*$/.test(s.trim()) || s.trim() === '#') { // 用作分隔线
        if (blocks.length && blocks[blocks.length - 1].type !== 'hr') blocks.push({ type: 'hr' });
        continue;
      }
      if (!s.trim()) {
        if (blocks.length && blocks[blocks.length - 1].type !== 'gap') blocks.push({ type: 'gap' });
        continue;
      }
      blocks.push({ type: 'p', text: decodeEntities(s.trim()) });
    }
    // 去掉首尾的 gap/hr
    while (blocks.length && blocks[0].type !== 'p') blocks.shift();
    while (blocks.length && blocks[blocks.length - 1].type !== 'p') blocks.pop();
    const paragraphs = blocks.filter((b) => b.type !== 'gap');

    const plain = paragraphs.filter((b) => b.type === 'p').map((b) => b.text).join('');
    const comments = parseComments(lines, footerStart);
    const visitors = parseVisitors(lines, footerStart);

    out.push({
      id: `blog-${nd.date}-${out.length}`,
      type: 'blog',
      file,
      date: nd.date,
      time: nd.time,
      year: nd.year,
      month: nd.month,
      title,
      category,
      author,
      paragraphs,     // [{type:'p',text} | {type:'hr'}]
      excerpt: plain.slice(0, 80),
      wordCount: plain.length,
      comments,
      visitors,       // [{name, date}]
    });
  }
  out.sort((a, b) => {
    const ka = `${a.date} ${a.time || ''}`, kb = `${b.date} ${b.time || ''}`;
    return ka < kb ? 1 : ka > kb ? -1 : 0;
  });
  return out;
}

// ---------- 汇总统计 ----------

function buildStats(moods, blogs) {
  const perYear = {};
  const bump = (y, key) => {
    if (!y) return;
    perYear[y] = perYear[y] || { year: y, moods: 0, blogs: 0 };
    perYear[y][key]++;
  };
  moods.forEach((m) => bump(m.year, 'moods'));
  blogs.forEach((b) => bump(b.year, 'blogs'));

  const categories = {};
  blogs.forEach((b) => { if (b.category) categories[b.category] = (categories[b.category] || 0) + 1; });

  const allDates = [...moods.map((m) => m.date), ...blogs.map((b) => b.date)]
    .filter((d) => d && d !== '0000-00-00').sort();
  const firstDate = allDates[0] || null;
  const lastDate = allDates[allDates.length - 1] || null;

  const totalImages = moods.reduce((s, m) => s + (m.imageCount || 0), 0);
  const totalWords = blogs.reduce((s, b) => s + (b.wordCount || 0), 0);

  return {
    totalMoods: moods.length,
    totalBlogs: blogs.length,
    totalImages,
    totalWords,
    firstDate,
    lastDate,
    spanYears: firstDate && lastDate ? Number(lastDate.slice(0, 4)) - Number(firstDate.slice(0, 4)) + 1 : 0,
    years: Object.values(perYear).sort((a, b) => a.year - b.year),
    categories: Object.entries(categories).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

// ---------- 入口 ----------

export function parseAll(root = process.cwd()) {
  warnings.length = 0;
  const moods = parseMoods(root);
  // 日志：优先 blogs-ai/，缺失时用示例 blogs-ai.sample/
  const realBlogs = join(root, 'blogs-ai');
  const hasRealBlogs = existsSync(realBlogs) && readdirSync(realBlogs).some((f) => f.endsWith('.md'));
  let blogDir = realBlogs;
  if (!hasRealBlogs && existsSync(join(root, 'blogs-ai.sample'))) {
    blogDir = join(root, 'blogs-ai.sample');
    warn('未找到 blogs-ai/，正在使用示例数据 blogs-ai.sample/');
  }
  const blogs = parseBlogs(blogDir);
  const stats = buildStats(moods, blogs);
  return {
    generatedAt: null, // 由调用方填时间戳（保持解析纯净）
    stats,
    moods,
    blogs,
  };
}
