# QQ空间导出器（Exporter）

把**你自己**的 QQ空间说说与日志导出成本地文件，供 [珍藏数字信息馆](../README.md) 展示。

> ⚠️ 仅用于导出**你本人已登录**的 QQ空间数据（自己的账号、自己的内容）。请勿用于获取他人账号数据。

---

## 它是怎么工作的（原理）

导出器本身不保存任何账号密码 —— 登录态完全来自你浏览器里已有的 Cookie。整体流程：

1. **浏览器控制**：通过 [Kimi WebBridge](https://kimi.com/features/webbridge) 守护进程（本地 `127.0.0.1:10086`）驱动你**真实的 Chrome**，复用你的登录会话。
2. **扫码登录**：打开 QQ空间登录页，你用手机 QQ 扫码；脚本每 2 秒轮询，检测到跳转至 `user.qzone.qq.com/{qq}` 即登录成功。
3. **算 g_tk 令牌**：QQ 的接口需要一个校验参数 `g_tk`，由 Cookie 里的 `p_skey` 经 `hash33` 算出：
   ```js
   hash33 = s => { let h = 5381; for (const c of s) h += (h << 5) + c.charCodeAt(0); return h & 0x7fffffff; }
   g_tk = hash33(/p_skey=([^;]+)/.exec(document.cookie)[1]);
   ```
4. **抓说说**：调用 QQ空间网页自身在用的 `emotion_cgi_msglist_v6` 接口（在已登录页面里 `fetch`，
   以带上你自己的 Cookie 并满足同源要求），从 `pos=0` 每页 20 条翻到底；
   每条取 `{c: 正文, t: 时间, ts: 时间戳, u: [图片URL]}` —— **这正是 `moods-all.json` 的字段格式**。
5. **抓日志**：进入 `/{qq}/blog`，操作 `#tblog` iframe 翻页，收集每篇的 id 与标题。

### 请求节流与稳定性
- 在**已登录页面上下文**里发 `fetch`（而非顶层跳转），以携带你自己的 Cookie、满足同源
- 每批 5 页（100 条），批间 `sleep 300ms`：**主动放慢、减轻服务器负担**
- 会话过期（接口返回登录页而非 JSON）时提示你**重新登录**

> 本工具**不含**任何验证码/滑块破解、IP 轮换或签名逆向；它只是用你自己的登录态、慢速地取你自己的数据。
> 若请求过快被限流，正确做法是**放慢重试**，而非对抗。

---

## 用法

前置：Node ≥ 18，Chrome + Kimi WebBridge 扩展，守护进程 `running: true`。

```bash
node exporter/qzone-export.js <你的QQ号>
# 可选： --skip-blogs 跳过日志   --dry-run 试运行不落盘
```

输出到 `exports/<QQ号>/`：`moods-raw.json`、`moods/`、`moods-ai/`、`blog-list.json`。
把其中的 JSON 重命名为项目根目录的 `moods-all.json` 即可被网站读取。

> `exports/` 已在 `.gitignore` 中 —— 你抓下来的真实数据不会被提交。

---

## 输出即「格式契约」

网站的 `parse.mjs` 认这套字段。只要你用本导出器，产出的格式与网站期望**天然一致**：

| 数据 | 字段 |
|---|---|
| 说说 | `{ "c": 正文, "t": "HH:MM", "ts": Unix秒, "u": ["图片URL", …] }` 的数组 |
| 日志 | 带 `date:` frontmatter 的 Markdown（见根目录 README 的格式约定）|

用别的爬虫也行，只要把输出对齐上面的字段即可；否则 `node build.mjs` 会打印告警提示格式不符。

---

## 常见错误

| 现象 | 原因 | 处理 |
|---|---|---|
| `请先登录空间` (code -3000) | 会话/g_tk 过期 | 重新登录取新 g_tk |
| 501 | 请求过快被限流 | 放慢重试 / 换会话 |
| 跳到 i.qq.com | Cookie 域不符 | 停留在 user.qzone.qq.com |
| 日志详情跳登录 | 直连被拦 | 用 iframe 点击法 |

*本导出器依赖 Kimi WebBridge 控制本机浏览器，不含任何硬编码凭据；登录态取自你的浏览器会话。*
