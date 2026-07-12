#!/usr/bin/env node
// QQ Zone Exporter — one-command export of moods & blogs
// Usage: node qzone-export.js <qq_number>
// See README.md for full documentation

const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const QQ = process.argv[2];
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_BLOGS = process.argv.includes('--skip-blogs');
const SESSION = 'qzexport-' + Date.now();

if (!QQ || QQ === '--help' || QQ === '-h') {
  console.log(`
╔══════════════════════════════════╗
║     QQ Zone Exporter v2.0       ║
╚══════════════════════════════════╝

Usage:  node qzone-export.js <qq_number> [options]

Options:
  --skip-blogs   Skip blog list collection
  --dry-run      Test without saving files

Example:
  node qzone-export.js 10001XXXXX
`);
  process.exit(0);
}

const BASE = __dirname;
const EXPORTS = path.join(BASE, 'exports', QQ);
fs.mkdirSync(EXPORTS, { recursive: true });

// ===================== API Client =====================
function api(method, params, session = SESSION) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ action: method, args: params, session });
    const req = http.request({
      hostname: '127.0.0.1', port: 10086, path: '/command', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const outer = JSON.parse(data);
          if (outer.ok && outer.data && outer.data.value !== undefined) {
            resolve(JSON.parse(outer.data.value));
          } else if (outer.ok && outer.data && outer.data.type === 'number') {
            resolve(outer.data.value);
          } else {
            resolve({ error: outer.error?.message || 'api_error', raw: data.substring(0, 300) });
          }
        } catch (e) { resolve({ error: 'parse: ' + e.message }); }
      });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.write(body);
    req.end();
  });
}

function ev(code) { return api('evaluate', { code }); }
function nav(url) { return api('navigate', { url, newTab: true }); }

// ===================== Step 1: Login =====================
async function login() {
  console.log('\n📱 正在打开 QQ 空间登录页...');

  const loginUrl = 'https://xui.ptlogin2.qq.com/cgi-bin/xlogin?' +
    'proxy_url=https%3A//qzs.qq.com/qzone/v6/portal/proxy.html&daid=5' +
    '&hide_title_bar=1&low_login=0&qlogin_auto_login=1&no_verifyimg=1' +
    '&link_target=blank&appid=549000912&style=22&target=self' +
    '&s_url=https%3A%2F%2Fqzs.qzone.qq.com%2Fqzone%2Fv5%2Floginsucc.html%3Fpara%3Dizone' +
    '&pt_qr_app=手机QQ空间&pt_qr_link=http%3A//z.qzone.com/download.html' +
    '&self_regurl=https%3A//qzs.qq.com/qzone/v6/reg/index.html' +
    '&pt_qr_help_link=http%3A//z.qzone.com/download.html&pt_no_auth=1';

  await nav(loginUrl);
  console.log('   👉 请用手机 QQ 扫描浏览器中的二维码');
  console.log('   ⏳ 等待登录...');

  // Poll for login success
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    const r = await ev('JSON.stringify({url:location.href,title:document.title})');
    if (r.url && r.url.includes('user.qzone.qq.com')) {
      console.log('   ✅ 登录成功！\n');
      return true;
    }
    if (i % 5 === 4) process.stdout.write('.');
  }
  console.log('\n   ❌ 登录超时，请重试');
  return false;
}

// ===================== Step 2: Get g_tk =====================
async function getGtk() {
  const r = await ev(
    `(()=>{var h=function(s){var x=5381;for(var i=0;i<s.length;i++){x+=(x<<5)+s.charCodeAt(i)}return x&0x7fffffff};var s=document.cookie.match(/p_skey=([^;]+)/);return JSON.stringify({gtk:s?h(s[1]):0})})()`
  );
  return r.gtk || 0;
}

// ===================== Step 3: Fetch moods =====================
async function fetchMoods(gtk) {
  console.log('📝 抓取说说...');

  // Get total count
  const first = await ev(
    `(async ()=>{
      var r=await fetch('https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6?uin=${QQ}&ftype=0&sort=0&pos=0&num=5&replynum=10&g_tk=${gtk}&code_version=1&format=json');
      var d=JSON.parse(await r.text());
      return JSON.stringify({total:d.total,code:d.code,msg:d.message})
    })()`
  );

  if (first.error || first.code !== 0) {
    console.log('   ❌ API 不可用: ' + (first.msg || first.error || '未知'));
    return 0;
  }

  const total = first.total;
  const pages = Math.ceil(total / 20);
  console.log(`   ${total} 条说说, ${pages} 页, 预计 ${Math.ceil(pages/5)} 批`);

  const BATCH = 5;
  const batches = Math.ceil(pages / BATCH);
  let all = [];
  let fails = 0;

  for (let b = 0; b < batches; b++) {
    const start = b * BATCH * 20;
    const items = await ev(
      `(async ()=>{
        var a=[];
        for(var p=0;p<${BATCH};p++){
          var pos=${start}+p*20;
          try{
            var r=await fetch('https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6?uin=${QQ}&ftype=0&sort=0&pos='+pos+'&num=20&replynum=100&g_tk=${gtk}&code_version=1&format=json');
            var d=JSON.parse(await r.text());
            if(d.msglist){for(var i=0;i<d.msglist.length;i++){var m=d.msglist[i];var u=[];if(m.pic)for(var j=0;j<m.pic.length;j++){var o=m.pic[j].url1||m.pic[j].smallurl||'';if(o)u.push(o)}a.push({c:m.content||'',t:m.createTime||'',ts:m.created_time||0,u:u})}}
          }catch(e){}
        }
        return JSON.stringify(a)
      })()`
    );

    const arr = Array.isArray(items) ? items : [];
    all = all.concat(arr);
    const pct = Math.round(all.length / total * 100);
    process.stdout.write(`\r   [${'█'.repeat(pct/5)}${' '.repeat(20-pct/5)}] ${pct}% (${all.length}/${total})`);

    if (arr.length === 0 && b > 0) { fails++; if (fails > 2) break; }
    await sleep(300);
  }
  console.log('');

  if (DRY_RUN) { console.log(`   🔍 试运行: 抓到 ${all.length} 条`); return all.length; }

  // Save raw JSON
  const jsonPath = path.join(EXPORTS, 'moods-raw.json');
  fs.writeFileSync(jsonPath, JSON.stringify(all, null, 2));
  console.log(`   💾 ${(fs.statSync(jsonPath).size/1024).toFixed(0)} KB → moods-raw.json`);

  // Generate Markdown
  generateMoodMarkdown(all);
  return all.length;
}

function generateMoodMarkdown(moods) {
  const mdDir = path.join(EXPORTS, 'moods');
  const aiDir = path.join(EXPORTS, 'moods-ai');
  [mdDir, aiDir].forEach(d => fs.mkdirSync(d, { recursive: true }));

  const groups = {};
  moods.forEach(m => {
    const d = new Date(m.ts * 1000);
    const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    (groups[ym] = groups[ym] || []).push(m);
  });

  const yearMap = {};
  Object.keys(groups).forEach(ym => { const y = ym.split('-')[0]; (yearMap[y] = yearMap[y] || []).push(ym); });

  Object.keys(yearMap).sort().reverse().forEach(year => {
    let md = `# ${year} 年说说\n\n`;
    let ai = `---\ntype: qzone-moods\nyear: ${year}\nsource: QQ空间说说\n---\n\n# ${year} 年说说\n\n`;

    yearMap[year].sort().reverse().forEach(ym => {
      const items = groups[ym];
      md += `## ${ym} (${items.length}条)\n\n`;
      ai += `## ${ym} (${items.length}条)\n\n`;

      items.forEach(m => {
        const ds = new Date(m.ts * 1000).toISOString().split('T')[0] + ' ' + m.t;
        const txt = m.c || '(无文字)';
        const imgN = m.u.length;
        const imgTag = imgN > 0 ? ` [图片×${imgN}]` : '';
        const clean = txt.replace(/\[em\][a-z0-9]+\[\/em\]/g, '');

        // Original MD
        md += `### ${ds}\n\n${txt.replace(/\\n/g, '\n\n')}\n\n`;
        m.u.forEach((url, i) => md += `![图片${i + 1}](${url})\n\n`);
        md += '---\n\n';

        // AI-optimized MD
        if (clean.length <= 60 && clean.indexOf('\n') === -1 && clean !== '(无文字)') {
          ai += `- **${ds}**${imgTag}: ${clean}\n\n`;
        } else {
          ai += `- **${ds}**${imgTag}\n`;
          clean.split('\n').forEach(l => ai += (l ? '  ' + l : '') + '\n');
          ai += '\n';
        }
      });
    });

    const mdFile = path.join(mdDir, `moods-${year}.md`);
    const aiFile = path.join(aiDir, `moods-${year}.md`);
    fs.writeFileSync(mdFile, md);
    fs.writeFileSync(aiFile, ai);
    console.log(`   📄 moods-${year}.md (${(fs.statSync(mdFile).size/1024).toFixed(0)}K / ${(fs.statSync(aiFile).size/1024).toFixed(0)}K AI)`);
  });
}

// ===================== Step 4: Blog list =====================
async function fetchBlogs() {
  if (SKIP_BLOGS) { console.log('\n📋 跳过博客 (--skip-blogs)'); return 0; }
  console.log('\n📋 收集博客列表...');

  await nav(`https://user.qzone.qq.com/${QQ}/blog`);
  await sleep(3000);

  const check = await ev(
    `JSON.stringify({ok:!!document.getElementById("tblog"),loggedIn:!document.querySelector("#login_frame")})`
  );
  if (!check.ok || !check.loggedIn) {
    console.log('   ⚠️  博客页面不可用 (需重新登录或空间无博客)');
    return 0;
  }

  const all = [];
  for (let page = 1; page <= 10; page++) {
    if (page > 1) {
      await ev(
        `(()=>{var w=document.getElementById("tblog").contentWindow;w.QZBlog.Util.PageIndexManager.goDirectPage(${page});return 1})()`
      );
      await sleep(1500);
    }

    const r = await ev(
      `(()=>{var d=document.getElementById("tblog").contentDocument;var as=d.querySelectorAll("a");var o=[];for(var i=0;i<as.length;i++){var h=as[i].href;if(h.indexOf("blog/")>-1&&h.indexOf("${QQ}")>-1)o.push({id:h.split("blog/")[1],t:as[i].textContent.trim().substring(0,80)})}return JSON.stringify({n:o.length,items:o})})()`
    );

    if (!r.items || r.items.length === 0) break;
    all.push(...r.items);
    process.stdout.write(`\r   第 ${page} 页: ${r.items.length} 篇 (共 ${all.length})`);

    if (r.items.length < 15) break;
  }
  console.log('');

  if (all.length === 0) { console.log('   ℹ️  未找到博客'); return 0; }

  if (!DRY_RUN) {
    fs.writeFileSync(path.join(EXPORTS, 'blog-list.json'), JSON.stringify(all, null, 2));
    console.log(`   💾 ${all.length} 篇博客列表已保存`);
    console.log('   ℹ️  博客内容需手动提取 (iframe 限制，详见 README)');
  }

  return all.length;
}

// ===================== Utilities =====================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===================== Main =====================
async function main() {
  console.clear();
  console.log('╔══════════════════════════════════╗');
  console.log('║     QQ Zone Exporter v2.0       ║');
  console.log('╚══════════════════════════════════╝');
  console.log(`\n🎯 QQ: ${QQ}`);
  if (DRY_RUN) console.log('🔍 试运行模式');

  // Step 1-2: Login & get token
  if (!(await login())) process.exit(1);
  const gtk = await getGtk();
  if (!gtk) { console.log('❌ 获取令牌失败'); process.exit(1); }

  // Step 3: Moods
  const moodN = await fetchMoods(gtk);
  console.log(`\n✅ 说说: ${moodN} 条`);

  // Step 4: Blogs
  const blogN = await fetchBlogs();
  console.log(`✅ 博客: ${blogN} 篇\n`);

  console.log(`📁 ${EXPORTS}`);
  console.log('🎉 完成！');
  process.exit(0);
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
