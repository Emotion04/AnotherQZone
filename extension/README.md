# 珍藏数字信息馆 · 同步器（Chrome 扩展）

让存档页一键同步最新的 QQ 空间说说。

## 工作原理

```
存档页点「同步」
  → chrome.runtime.sendMessage → 扩展 background.js
    → chrome.cookies 读 p_skey → 算 g_tk
      → 静默 fetch 说说 API（不需要打开 qzone 页面）
        → 增量比对 ts（不重抓已有）
          → POST 给本地 serve.mjs → 写 moods-all.json → 重新 build
            → 存档页收到进度 → 卡片显示结果 → 刷新可见
```

## 安装方法

1. 打开 `chrome://extensions`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `extension/` 文件夹
5. 保持 Chrome 已登录 QQ 空间

## 日常使用

1. 启动 `node serve.mjs`（本地服务器）
2. 打开 `http://localhost:4321`
3. 点击顶栏 🔄 同步按钮 → 卡片出现 → 自动同步

## 技术细节

- **权限**：`cookies`（读 `p_skey`） + `host_permissions: user.qzone.qq.com`
- **通信**：`externally_connectable` 仅允许 `localhost` → 外部不可达
- **静默**：后台 Service Worker 直接 fetch，不需要打开标签页
- **增量**：比对 `ts`（Unix 时间戳）去重 → 不重复抓取
- **速率**：每批 5 页 / 300ms 间隔 → 对服务器客气

## 故障排查

| 现象 | 处理 |
|------|------|
| 卡片显示「无法连接」 | 确认扩展已加载、Chrome 已打开 |
| 「未找到登录态」 | 在 Chrome 里先登录一次 `user.qzone.qq.com` |
| 「API error」 | 长时间未刷新可能导致 g_tk 过期，重新登录 QQ 空间即可 |
| 抓完了但没新数据 | 正常——增量模式下已存在的说说不重抓 |
