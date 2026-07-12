/* ============================================================
   珍藏数字信息馆 · 前端逻辑
   四个视图（概览 / 时间轴 / 说说 / 日志）+ 搜索 + 年份筛选 + 阅读浮层
   数据来源：window.__ARCHIVE__（由 build.mjs / serve.mjs 提供）
   ============================================================ */
(function () {
  'use strict';

  const DATA = window.__ARCHIVE__ || { stats: {}, moods: [], blogs: [] };
  const { moods, blogs, stats } = DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 高亮搜索命中
  function hi(text, q) {
    const t = esc(text);
    if (!q) return t;
    try {
      const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      return t.replace(re, '<mark>$1</mark>');
    } catch { return t; }
  }
  // 说说正文：高亮 + 保留换行
  const moodHtml = (text, q) => hi(text, q).replace(/\n/g, '<br>');

  const fmtDate = (d) => d && d !== '0000-00-00' ? d : '—';
  const cn = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // 状态
  const state = {
    view: 'overview', q: '', year: 'all',
    clean: localStorage.getItem('archive-clean') === '1', // 简洁模式：隐藏赞/评论/访客
    gallery: [], gi: 0,                                    // 当前灯箱图集与索引
  };

  // 说说图片画廊（缩略图，懒加载）。images: URL 数组；n: 回退计数
  function galleryHtml(images, n, mid) {
    if (images && images.length) {
      const thumbs = images.map((u, i) =>
        `<button class="thumb" data-mid="${mid}" data-gi="${i}" aria-label="查看第${i + 1}张">
           <img loading="lazy" src="${esc(u)}" alt="">
         </button>`).join('');
      return `<div class="gallery">${thumbs}</div>`;
    }
    if (n) return `<span class="tl-img">▨ ${n}</span>`; // markdown 回退：只有计数
    return '';
  }

  // ---------- 概览 ----------
  function renderOverview() {
    const el = $('#view-overview');
    const s = stats;
    const maxMood = Math.max(1, ...s.years.map((y) => y.moods));
    const maxBlog = Math.max(1, ...s.years.map((y) => y.blogs));

    const statCards = [
      { num: cn(s.totalMoods), unit: '条', label: '说说' },
      { num: cn(s.totalBlogs), unit: '篇', label: '日志' },
      { num: cn(s.totalImages), unit: '张', label: '影像' },
      { num: s.spanYears, unit: '年', label: '时光跨度' },
    ].map((c) => `
      <div class="stat">
        <div class="stat-num">${c.num}<span class="unit">${c.unit}</span></div>
        <div class="stat-label">${c.label}</div>
      </div>`).join('');

    const chart = [...s.years].sort((a, b) => b.year - a.year).map((y) => `
      <div class="chart-row" data-year="${y.year}" title="${y.year} 年：${y.moods} 条说说 · ${y.blogs} 篇日志">
        <span class="chart-year">${y.year}</span>
        <div class="chart-bars">
          <div class="bar"><div class="bar-fill" style="width:${(y.moods / maxMood * 100).toFixed(1)}%"></div></div>
          ${y.blogs ? `<div class="bar"><div class="bar-fill blogs" style="width:${(y.blogs / maxBlog * 100).toFixed(1)}%"></div></div>` : ''}
        </div>
        <span class="chart-count">${y.moods} 说 · ${y.blogs} 志</span>
      </div>`).join('');

    const tags = s.categories.map((c) => `<span class="tag">${esc(c.name)}<b>${c.count}</b></span>`).join('');

    el.innerHTML = `
      <p class="intro">
        自 <em>${fmtDate(s.firstDate)}</em> 落下第一行字，
        到 <em>${fmtDate(s.lastDate)}</em> 仍在续写。<br>
        这里封存着 ${cn(s.totalMoods)} 条散碎心绪与 ${cn(s.totalBlogs)} 篇长短思考——<br>
        是一个人在互联网角落，写给时间的信。
      </p>

      <div class="stat-grid">${statCards}</div>

      <div class="chart">
        <div class="section-label">年度轨迹 · 点击跳转时间轴</div>
        ${chart}
        <div class="filters" style="margin-top:16px">
          <span class="tag" style="border-style:dashed"><b style="margin:0">■</b>&nbsp;说说</span>
          <span class="tag" style="border-style:dashed"><b style="margin:0">□</b>&nbsp;日志</span>
        </div>
      </div>

      ${tags ? `<div class="chart"><div class="section-label">日志分类</div><div class="tagcloud">${tags}</div></div>` : ''}
    `;

    $$('.chart-row', el).forEach((row) => row.addEventListener('click', () => {
      state.year = row.dataset.year;
      go('timeline');
    }));
  }

  // ---------- 年份筛选条 ----------
  function yearFilter(count) {
    const years = [...new Set([...moods, ...blogs].map((x) => x.year).filter(Boolean))].sort((a, b) => b - a);
    const chip = (val, label) => `<button class="chip${state.year == val ? ' is-active' : ''}" data-year="${val}">${label}</button>`;
    return `<div class="filters">
      ${chip('all', '全部')}
      ${years.map((y) => chip(y, y)).join('')}
      <span class="filters-count">${count}</span>
    </div>`;
  }
  function bindYearChips(el, rerender) {
    $$('.chip', el).forEach((c) => c.addEventListener('click', () => {
      state.year = c.dataset.year;
      rerender();
    }));
  }

  const matchYear = (x) => state.year === 'all' || String(x.year) === String(state.year);
  const matchQ = (text) => !state.q || String(text).toLowerCase().includes(state.q.toLowerCase());

  // ---------- 时间轴 ----------
  function renderTimeline() {
    const el = $('#view-timeline');
    const items = [
      ...moods.map((m) => ({ ...m })),
      ...blogs.map((b) => ({ ...b })),
    ]
      .filter(matchYear)
      .filter((x) => x.type === 'mood' ? matchQ(x.text) : matchQ(x.title + (x.excerpt || '')))
      .sort((a, b) => {
        const ka = `${a.date} ${a.time || '00:00'}`, kb = `${b.date} ${b.time || '00:00'}`;
        return ka < kb ? 1 : ka > kb ? -1 : 0;
      });

    if (!items.length) { el.innerHTML = yearFilter(0) + emptyState(); bindYearChips(el, renderTimeline); return; }

    let html = yearFilter(`${items.length} 条记录`);
    html += '<div class="timeline">';
    let curYear = null;
    const yearCounts = {};
    items.forEach((it) => { yearCounts[it.year] = (yearCounts[it.year] || 0) + 1; });

    for (const it of items) {
      if (it.year !== curYear) {
        curYear = it.year;
        html += `<div class="tl-year"><h3>${curYear}</h3><span class="yr-count">${yearCounts[curYear]} 条</span></div>`;
      }
      const md = it.date.slice(5); // MM-DD
      if (it.type === 'mood') {
        const body = it.text
          ? `<span>${moodHtml(it.text, state.q)}</span>`
          : `<span class="empty">（无文字）</span>`;
        const gal = galleryHtml(it.images, it.imageCount, it.id);
        html += `
          <div class="tl-item">
            <div class="tl-date">${md}</div>
            <div class="tl-rail"><span class="tl-node"></span></div>
            <div class="tl-body"><div class="tl-mood">${body}</div>${gal}</div>
          </div>`;
      } else {
        html += `
          <div class="tl-item">
            <div class="tl-date">${md}</div>
            <div class="tl-rail"><span class="tl-node blog"></span></div>
            <div class="tl-body">
              <div class="tl-blog" data-blog="${it.id}">
                <div class="tl-blog-kicker">日志${it.category ? ' · ' + esc(it.category) : ''}</div>
                <h4>${hi(it.title, state.q)}</h4>
                ${it.excerpt ? `<p>${hi(it.excerpt, state.q)}…</p>` : ''}
                <div class="read">阅读全文 →</div>
              </div>
            </div>
          </div>`;
      }
    }
    html += '</div>';
    el.innerHTML = html;
    bindYearChips(el, renderTimeline);
    $$('.tl-blog', el).forEach((c) => c.addEventListener('click', () => openReader(c.dataset.blog)));
    bindThumbs(el);
  }

  // 绑定缩略图点击 → 打开灯箱
  function bindThumbs(el) {
    $$('.thumb', el).forEach((t) => t.addEventListener('click', (e) => {
      e.preventDefault();
      const mood = moods.find((m) => m.id === t.dataset.mid);
      if (mood && mood.images && mood.images.length) openLightbox(mood, Number(t.dataset.gi));
    }));
  }

  // ---------- 说说 ----------
  function renderMoods() {
    const el = $('#view-moods');
    const list = moods.filter(matchYear).filter((m) => matchQ(m.text));
    if (!list.length) { el.innerHTML = yearFilter(0) + emptyState(); bindYearChips(el, renderMoods); return; }

    // 按年分组
    const byYear = {};
    list.forEach((m) => { (byYear[m.year] = byYear[m.year] || []).push(m); });
    const years = Object.keys(byYear).sort((a, b) => b - a);

    let html = yearFilter(`${list.length} 条`);
    for (const y of years) {
      const arr = byYear[y];
      html += `<div class="mood-year">
        <div class="mood-year-head"><h3>${y}</h3><span>${arr.length} 条</span></div>
        <div class="mood-list">`;
      for (const m of arr) {
        const body = m.text ? moodHtml(m.text, state.q) : `<span class="empty">（无文字）</span>`;
        const gal = galleryHtml(m.images, m.imageCount, m.id);
        html += `<div class="mood">
          <span class="mood-d">${m.date.slice(5)}${m.time ? '<br>' + m.time : ''}</span>
          <div class="mood-t">${body}${gal}</div>
        </div>`;
      }
      html += '</div></div>';
    }
    el.innerHTML = html;
    bindYearChips(el, renderMoods);
    bindThumbs(el);
  }

  // ---------- 日志 ----------
  function renderBlogs() {
    const el = $('#view-blogs');
    const list = blogs
      .filter(matchYear)
      .filter((b) => matchQ(b.title + ' ' + (b.paragraphs || []).map((p) => p.text || '').join(' ') + ' ' + (b.category || '')));
    if (!list.length) { el.innerHTML = yearFilter(0) + emptyState(); bindYearChips(el, renderBlogs); return; }

    let html = yearFilter(`${list.length} 篇`);
    html += '<div class="blog-list">';
    for (const b of list) {
      const badges = [
        b.category ? `<span class="badge cat">${esc(b.category)}</span>` : '',
        `<span class="badge">${b.wordCount} 字</span>`,
        !state.clean && b.comments && b.comments.length ? `<span class="badge">评论 ${b.comments.length}</span>` : '',
        !state.clean && b.visitors && b.visitors.length ? `<span class="badge">访客 ${b.visitors.length}</span>` : '',
      ].filter(Boolean).join('');
      html += `<div class="blog-card" data-blog="${b.id}">
        <span class="blog-d">${b.date}</span>
        <div class="blog-main">
          <h3>${hi(b.title, state.q)}</h3>
          ${b.excerpt ? `<p>${hi(b.excerpt, state.q)}…</p>` : '<p style="opacity:.5">（无正文）</p>'}
          <div class="blog-badges">${badges}</div>
        </div>
        <span class="blog-arrow">→</span>
      </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
    $$('.blog-card', el).forEach((c) => c.addEventListener('click', () => openReader(c.dataset.blog)));
  }

  function emptyState() {
    return `<div class="empty-state"><div class="big">∅</div>没有找到匹配的记录${state.q ? `：“${esc(state.q)}”` : ''}</div>`;
  }

  // ---------- 阅读浮层 ----------
  function openReader(id) {
    const b = blogs.find((x) => x.id === id);
    if (!b) return;
    const panel = $('#readerPanel');
    const bodyHtml = (b.paragraphs && b.paragraphs.length)
      ? b.paragraphs.map((p) => p.type === 'hr' ? '<hr>' : `<p>${esc(p.text)}</p>`).join('')
      : '<p class="reader-empty">这篇没有留下正文，只有一个标题。</p>';

    const meta = [
      b.date + (b.time ? ' ' + b.time : ''),
      b.category ? esc(b.category) : '',
      b.author ? '原创 · ' + esc(b.author) : '',
      b.wordCount + ' 字',
    ].filter(Boolean).map((m) => `<span>${m}</span>`).join('');

    const comments = (!state.clean && b.comments && b.comments.length) ? `
      <div class="reader-comments">
        <h4>评论 · ${b.comments.length}</h4>
        ${b.comments.map((c) => `
          <div class="cmt">
            <span class="cmt-floor">${c.floor}F</span>
            <div>
              <div class="cmt-head"><span class="cmt-author">${esc(c.author) || '匿名'}</span><span class="cmt-time">${esc(c.time)}</span></div>
              <div class="cmt-text">${esc(c.text)}</div>
            </div>
          </div>`).join('')}
      </div>` : '';

    const visitors = (!state.clean && b.visitors && b.visitors.length) ? `
      <div class="reader-visitors">
        <h4>本文最近访客 · ${b.visitors.length}</h4>
        <div class="visitor-grid">
          ${b.visitors.map((v) => `<span class="visitor"><b>${esc(v.name)}</b><i>${esc(v.date)}</i></span>`).join('')}
        </div>
      </div>` : '';

    panel.innerHTML = `
      <button class="reader-close" data-close aria-label="关闭">✕</button>
      <div class="reader-kicker">日志</div>
      <h1 class="reader-title">${esc(b.title)}</h1>
      <div class="reader-meta">${meta}</div>
      <div class="reader-body">${bodyHtml}</div>
      ${comments}
      ${visitors}
    `;
    const reader = $('#reader');
    reader.hidden = false;
    state._openBlog = id;
    document.body.style.overflow = 'hidden';
    panel.scrollTop = 0;
  }
  function closeReader() {
    $('#reader').hidden = true;
    state._openBlog = null;
    document.body.style.overflow = '';
  }

  // ---------- 图片灯箱 ----------
  function openLightbox(mood, idx) {
    state.gallery = mood.images || [];
    state.gi = idx || 0;
    if (!state.gallery.length) return;
    showLightbox();
    $('#lightbox').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function showLightbox() {
    const imgs = state.gallery;
    const i = state.gi;
    $('#lbImg').src = imgs[i];
    $('#lbCap').textContent = imgs.length > 1 ? `${i + 1} / ${imgs.length}` : '';
    const multi = imgs.length > 1;
    $('#lbPrev').style.display = multi ? '' : 'none';
    $('#lbNext').style.display = multi ? '' : 'none';
  }
  function lbStep(d) {
    const n = state.gallery.length;
    if (n < 2) return;
    state.gi = (state.gi + d + n) % n;
    showLightbox();
  }
  function closeLightbox() {
    $('#lightbox').hidden = true;
    $('#lbImg').src = '';
    if ($('#reader').hidden) document.body.style.overflow = '';
  }

  // ---------- 视图切换 ----------
  const RENDER = { overview: renderOverview, timeline: renderTimeline, moods: renderMoods, blogs: renderBlogs };
  function go(view, skipHash) {
    if (!RENDER[view]) view = 'overview';
    state.view = view;
    $$('.view').forEach((v) => v.hidden = true);
    $('#view-' + view).hidden = false;
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.nav === view));
    moveUnderline();
    // 搜索框仅在内容视图显示
    $('#searchWrap').style.visibility = view === 'overview' ? 'hidden' : 'visible';
    RENDER[view]();
    if (!skipHash) location.hash = view === 'overview' ? '' : view;
    if (view !== state._last) window.scrollTo({ top: 0, behavior: 'smooth' });
    state._last = view;
  }

  function moveUnderline() {
    const active = $('.tab.is-active');
    const u = $('#tabUnderline');
    if (!active) return;
    u.style.left = active.offsetLeft + 'px';
    u.style.width = active.offsetWidth + 'px';
  }

  // ---------- 主题 ----------
  function initTheme() {
    const saved = localStorage.getItem('archive-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    $('#themeToggle').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('archive-theme', next);
    });
  }

  // ---------- 简洁模式（隐藏赞/评论/访客） ----------
  function applyCleanUI() {
    $('#cleanToggle').classList.toggle('is-on', state.clean);
    $('#cleanToggle').title = state.clean ? '简洁模式：已隐藏评论 / 访客（点击显示）' : '简洁模式：显示评论 / 访客（点击隐藏）';
  }
  function initClean() {
    applyCleanUI();
    $('#cleanToggle').addEventListener('click', () => {
      state.clean = !state.clean;
      localStorage.setItem('archive-clean', state.clean ? '1' : '0');
      applyCleanUI();
      if (state.view === 'blogs') renderBlogs();          // 卡片徽标随之更新
      if (!$('#reader').hidden && state._openBlog) openReader(state._openBlog); // 浮层开着则重渲染
    });
  }

  // ---------- 事件绑定 ----------
  function init() {
    // 顶部元信息
    $('#heroMeta').textContent = `${fmtDate(stats.firstDate)} — ${fmtDate(stats.lastDate)} · ${cn(stats.totalMoods + stats.totalBlogs)} 条记录`;
    if (DATA.generatedAt) {
      const d = new Date(DATA.generatedAt);
      const pad = (n) => String(n).padStart(2, '0');
      $('#footMeta').textContent = `更新于 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    // 导航
    $$('[data-nav]').forEach((n) => n.addEventListener('click', (e) => { e.preventDefault(); go(n.dataset.nav); }));

    // 搜索（防抖）
    let t;
    $('#search').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.q = e.target.value.trim();
        if (state.view !== 'overview') RENDER[state.view]();
      }, 160);
    });

    // 阅读浮层关闭
    $('#reader').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeReader(); });

    // 灯箱：关闭 / 前后翻
    $('#lightbox').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeLightbox(); });
    $('#lbPrev').addEventListener('click', (e) => { e.stopPropagation(); lbStep(-1); });
    $('#lbNext').addEventListener('click', (e) => { e.stopPropagation(); lbStep(1); });

    document.addEventListener('keydown', (e) => {
      if (!$('#lightbox').hidden) {
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft') lbStep(-1);
        else if (e.key === 'ArrowRight') lbStep(1);
        return;
      }
      if (e.key === 'Escape') closeReader();
    });

    window.addEventListener('resize', moveUnderline);
    window.addEventListener('hashchange', () => {
      const v = location.hash.replace('#', '');
      if (v && RENDER[v] && v !== state.view) go(v, true);
    });
    initTheme();
    initClean();
    const initial = location.hash.replace('#', '');
    go(RENDER[initial] ? initial : 'overview', true);
    // 字体加载后重新定位下划线
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveUnderline);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
