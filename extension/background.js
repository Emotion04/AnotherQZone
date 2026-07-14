// 珍藏数字信息馆 · 同步器 (background service worker)
// 接收存档页请求 → 静默 fetch QQ 说说 API → 增量比对 → POST 回流本地 serve.mjs
'use strict';

const QZONE = 'user.qzone.qq.com';
const SYNC_URL = 'http://127.0.0.1:4321/__sync__'; // serve.mjs 端点

// ---------- g_tk 计算 ----------
function hash33(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h += (h << 5) + s.charCodeAt(i);
  return h & 0x7fffffff;
}

async function getGtk() {
  const cookie = await chrome.cookies.get({ url: 'https://user.qzone.qq.com/', name: 'p_skey' });
  return cookie ? hash33(cookie.value) : 0;
}

// ---------- 说说 API ----------
async function fetchMoodsPage(qq, gtk, pos) {
  const url = `https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6?uin=${qq}&ftype=0&sort=0&pos=${pos}&num=20&replynum=1&g_tk=${gtk}&code_version=1&format=json`;
  const r = await fetch(url, { credentials: 'include' });
  const d = await r.json();
  if (d.code !== 0) throw new Error(`API error ${d.code}: ${d.message || 'unknown'}`);
  const items = [];
  if (d.msglist) {
    for (const m of d.msglist) {
      const u = [];
      if (m.pic) for (const p of m.pic) { const o = p.url1 || p.smallurl || ''; if (o) u.push(o); }
      items.push({ c: m.content || '', t: m.createTime || '', ts: m.created_time || 0, u });
    }
  }
  return { total: d.total, items };
}

// ---------- 增量比对 ----------
function mergeNew(remote, existingJson) {
  // existingJson: 现有 moods-all.json 的 JSON 字符串；remote: 新抓的 [{c,t,ts,u}]
  let existing = [];
  try { existing = JSON.parse(existingJson); } catch (e) { existing = []; }
  if (!Array.isArray(existing)) existing = [];

  const existingTs = new Set(existing.map(m => m.ts).filter(Boolean));
  const fresh = remote.filter(m => !existingTs.has(m.ts));
  // 合并：新数据在前
  const merged = [...fresh, ...existing].sort((a, b) => b.ts - a.ts);
  return { fresh, merged, skipped: remote.length - fresh.length };
}

// ---------- 向 serve.mjs 回流传数据 ----------
async function postToServer(data) {
  const r = await fetch(SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`服务端 ${r.status}`);
  return r.json();
}

// ---------- 主流程 ----------
async function doSync(qq, sendProgress) {
  sendProgress({ stage: 'connect', msg: '正在连接 QQ…' });

  const gtk = await getGtk();
  if (!gtk) { sendProgress({ stage: 'error', msg: '未找到 QQ 登录态，请先在 Chrome 中登录 qzone' }); return; }

  sendProgress({ stage: 'fetch', msg: '正在获取说说…' });

  // 先取首页拿 total
  const first = await fetchMoodsPage(qq, gtk, 0);
  const total = first.total;
  const allRemote = [...first.items];

  // 继续翻页直到新数据落后于已有最新 ts
  const pages = Math.ceil(total / 20);
  let page = 1;
  while (page < pages && page < 50) { // 最多 50 页 = 1000 条 (增量足够了)
    await sleep(300);
    const batched = [];
    for (let b = 0; b < 5 && page + b < pages; b++) {
      try {
        const r = await fetchMoodsPage(qq, gtk, page * 20);
        batched.push(...r.items);
      } catch (e) { /* skip dead page */ }
    }
    allRemote.push(...batched);
    page += 5;
    sendProgress({ stage: 'fetch', msg: `正在获取说说… ${Math.min(page * 20, total)}/${total}` });
  }

  sendProgress({ stage: 'merge', msg: '正在增量比对…' });

  // 从 serve.mjs 拿现有的 moods-all.json
  let existing = '';
  try {
    const er = await fetch('http://127.0.0.1:4321/__sync_existing__');
    if (er.ok) existing = await er.text();
  } catch (e) { /* 第一次同步，没有已有数据，没问题 */ }

  const { fresh, merged, skipped } = mergeNew(allRemote, existing);

  sendProgress({ stage: 'save', msg: `发现 ${fresh.length} 条新说说，跳过 ${skipped} 条已有` });

  if (fresh.length > 0) {
    const result = await postToServer({ moods: merged });
    sendProgress({ stage: 'done', newCount: fresh.length, skipped, total: merged.length, updatedAt: result.updatedAt });
  } else {
    sendProgress({ stage: 'done', newCount: 0, skipped, total: merged.length, updatedAt: null });
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- 消息路由 ----------
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'sync') {
    // 保持长连接用于进度回传
    const port = chrome.runtime.connect({ name: 'sync-progress' });
    // 启动同步
    doSync(msg.qq, (progress) => {
      try { port.postMessage(progress); } catch (e) { /* disconnected */ }
    }).then(() => {
      port.disconnect();
    }).catch(err => {
      try { port.postMessage({ stage: 'error', msg: err.message }); } catch (e) {}
      port.disconnect();
    });
    sendResponse({ ok: true });
    return true; // 保持异步响应
  }
  if (msg.action === 'ping') {
    sendResponse({ ok: true, name: 'another-qzone-syncer' });
    return true;
  }
});
