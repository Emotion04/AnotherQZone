# 珍藏数字信息馆 · 设计规范

> 所有新增 UI（配置卡片、同步按钮、状态指示器、扩展弹窗）必须遵循本规范。
> 如本规范与 `site/styles.css` 的已有代码冲突，以规范为准；如规范缺失某个场景，**对齐已有代码**而非另起新约定。

---

## 1. 调色板（纯单色系统）

只使用 CSS 变量，**绝不硬编码颜色值**。明暗双主题覆盖全部 Token。

| Token | light | dark | 语义 |
|-------|-------|------|------|
| `--bg` | `#ffffff` | `#0b0b0c` | 页面底色 |
| `--fg` | `#0a0a0a` | `#f1f1f1` | 前景 / 正文色 |
| `--muted` | `#767676` | `#8b8b8b` | 次级文字 / 占位符 / 提示 |
| `--faint` | `#f6f6f6` | `#161618` | 微背景（hover 行 / 卡片内侧） |
| `--line` | `#e6e6e6` | `#262629` | 分隔线 / 弱边框 |
| `--line-2` | `#d4d4d4` | `#34343a` | 强一级边框（输入框 / 按钮外圈） |
| `--strong` | `#0a0a0a` | `#f1f1f1` | 同 fg，语义强调色 |
| `--shadow` | `0 24px 60px -20px rgba(0,0,0,.28)` | `0 24px 60px -20px rgba(0,0,0,.7)` | 浮层面板投影 |

严禁新增颜色 Token。严禁使用 `gray`/`silver`/`#ccc` 等字面量。

## 2. 字体

| 角色 | 字体栈 | 样例 |
|------|--------|------|
| **UI / 系统文字** | `--font-sans`：Noto Sans SC, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif | 按钮、标签、顶栏、卡片标题 |
| **正文 / 标题展示** | `--font-serif`：Noto Serif SC, Georgia, "Songti SC", "STSong", "SimSun", serif | 日志阅读正文、hero 标题 |
| **数据 / 数字 / 时间** | `--font-mono`：SFMono, Cascadia Code, JetBrains Mono, Consolas, monospace | 日期、统计数字、筛选 chip、进度显示 |

**规则**：
- UI 交互元素一律 `--font-sans`。
- 阅读 / 内容展示一律 `--font-serif`。
- 纯数据（日期 / 计数 / 时间 / 百分比）一律 `--font-mono`。
- 不新增字体引入；离线友好——所有字体栈末尾都有系统回退。

## 3. 间距系统

- `--w: 940px` 为内容最大宽（已有，全域遵守）。
- 边距取 `4px` 的整数倍：`4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64`。
- 卡片内边距：`14px 16px`（小卡）或 `22px`（大卡）。
- 段落间距：`1.2em–1.6em` 行高（sans 1.6, serif 1.85–1.95 用在正文阅读）。

## 4. 圆角系统（统一用 `px`，不用 `rem`）

| 元素 | border-radius |
|------|---------------|
| 按钮 / chip / tag / 搜索框 / 访客标签 | `999px`（胶囊） |
| 卡片 / 面板 / 日志阅读浮层 | `3px` |
| 图表条形 / 缩略图 | `2px` |
| 分隔条 underline / bar-fill | `2px` |

**规则**：**非胶囊即 2-3px**。不做 6/8/12/16px 的软圆角风格。棱角感 = 硬朗极简。

## 5. 边框

- 常态下统一 `1px solid`，用 `--line` 或 `--line-2`。
- **不用 box-shadow 当边框**（唯浮层面板用 `--shadow`）。
- **不用 border-width > 1px**。
- 虚线只在装饰性分隔（如年度图表行 `1px dashed var(--line)`），不在交互元素中。

| 场景 | 边框 | 示例 |
|------|------|------|
| 输入 / 按钮外圈 / 卡片 | `1px solid var(--line-2)` | 搜索框、icon-btn、blog-card |
| 内部弱分隔 | `1px solid var(--line)` | 表格线、mood-year-head 底线、foot 顶线 |
| 装饰分隔 | `1px dashed var(--line)` | chart-row 底、评论分隔 |
| focus / hover | `border-color: var(--fg)`（颜色增强而非加粗） | icon-btn:focus-within, tl-blog:hover |

## 6. 互动反馈

| 动作 | 效果 |
|------|------|
| hover（可点元素） | `border-color → var(--fg)`，卡片加 `translateX(2px)` |
| active / click | `transform: scale(.94)`（icon-btn）或 `translateY(0)`（thumb）|
| focus-within（输入） | `border-color → var(--fg)`，同 hover |
| 过渡函数 | `--ease: cubic-bezier(.2, .7, .2, 1)` |
| 动画时长 | 颜色/边框 `.2–.25s`，位置/尺寸 `.35s`，入场 `.35s–.5s` |
| 入场动画 | `fade`（`opacity 0→1 + translateY(8px)→0`，`.5s`）|
| 弹出面板 | `pop`（`opacity 0→1 + translateY(16px)→0 + scale(.98)→1`，`.4s`）|

**不做**：过度阴影、彩色渐变、大位移。

## 7. 组件词汇（可直接复用）

### 图标按钮 `.icon-btn`
- `34×34 px`, `border-radius: 999px`, `border: 1px solid var(--line-2)`
- hover 边框变色，active `scale(.94)`
- 内部放 SVG（无 fill、stroke="currentColor"）或纯文字符号（`◼` / `✕` / `‹` / `›` / `→`）

### 胶囊 Chip `.chip`
- `border: 1px solid var(--line-2)`, `border-radius: 999px`, `padding: 5px 13px`
- 字体 `--font-mono`, `12.5px`, 色 `--muted`
- 激活态 `.is-active`：`background: var(--fg); color: var(--bg); border-color: var(--fg)`

### 卡片 `.tl-blog` / `.blog-card`
- `border: 1px solid var(--line)`, `border-radius: 3px`, `padding: 14px 16px`/`22px 8px`
- hover `border-color: var(--fg)` + 微位移

### 标签 Badge `.badge`
- `font-size: 11px`, `color: var(--muted)`, `--font-mono`
- 分类版：`.badge.cat` = `border: 1px solid var(--line-2)`, `border-radius: 3px`, `padding: 1px 7px`

### 段落标签 `.tag`
- 同胶囊，`font-size: 12.5px`（比 chip 略小），常态 muted

### 浮层面板
- `background: var(--bg); border: 1px solid var(--line); box-shadow: var(--shadow); border-radius: 3px`
- 入场 `animation: pop .35s--.4s var(--ease)`
- 遮罩 `background: color-mix(in srgb, #000 88%, transparent); backdrop-filter: blur(4px)`（灯箱用）或半透明背景（阅读浮层用 `color-mix(in srgb, var(--bg) 40%, #000 55%)`）

## 8. 将要新增的组件：配置卡片

- 触发：顶栏现有图标按钮区新增一个图标按钮（`icon-btn`，齿轮 SVG）。
- 弹出卡片：从按钮下拉（`position: absolute`，右对齐），`width: 320px`，最大宽视口自适应。
- 内部布局：段标题用 `.section-label`；选项行用行内 flex + chip 切换；底部一个确认/关闭。
- 动画：`pop` 入场，点击遮罩或 Esc 关闭。
- 主题：完全走 CSS 变量，与明暗模式同步，**不另写 dark 覆盖**。

## 9. 将要新增的组件：同步按钮 + 状态

- 位置：顶栏 `mast-actions` 内，排在现有按钮之前（最左）。
- 静止态：同步 icon-btn（SVG 圆箭头 / 刷新图标），标题"同步数据"。
- 进行中：图标旋转 360° 无限循环；文字变 `--muted`。
- 完成：显示此次新增条数（`+ XX`，字体 `--font-mono`, `12px`），3 秒后收回为静止图标。
- 失败：红色 icon（`#d44`），title 显示错误信息；点击 retry。

## 10. 响应式

- `max-width: 940px` 自适应（已有 `--w`）。
- `< 720px` 时：
  - 搜索框缩窄至 `150px`
  - 统计网格改为 2 列
  - 时间轴日期列缩窄 60→48px
  - 博客卡片单列、隐藏箭头
  - 配置卡片 `width: 280px`
- 始终支持 `prefers-reduced-motion`：关闭所有动画和过渡。

## 11. 设计约束清单（快速自查）

- [ ] 所有颜色走 CSS 变量，禁止硬编码
- [ ] 字体对号入座：UI→sans, 内容→serif, 数据→mono
- [ ] 圆角：胶囊或 2-3px，不准出现 6/8/12/16
- [ ] 边框 1px，不用多色多彩
- [ ] 过渡使用 `--ease`，不做花哨 spring
- [ ] 浮层面板带 `--shadow` + `pop` 动画
- [ ] 按钮 active 带 `scale(.94)` 反馈
- [ ] 明暗双主题与已有组件同步
- [ ] 不引入新颜色、新字体、新依赖
- [ ] `<720px` 移动端适配
