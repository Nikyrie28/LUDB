# LUDB · 项目维护手册

给在这个文件夹里工作的 AI 助手（Codex / ZCode 通用）：动手前先读完本文件。

## 这是什么项目

个人观影数据库站点，站名 **LUDB**。零依赖纯静态，没有 package.json 或框架；本地改完刷新即可，线上发布前用 Node.js 校验并复制必要文件到 `dist/`。

- **位置**：本仓库根目录；本机文件夹名保留 LMDB，与摄影作品集是独立项目
- **预览**：`http://localhost:8765`
- **线上**：https://ludb.vercel.app/；GitHub 公开仓库：https://github.com/Nikyrie28/LUDB
- **发布方向**：用户于 2026-10-02 要求将现有网站上传 GitHub 公开仓库并部署到 Vercel，替代此前仅本地使用的范围；保留当前海报，注明来源与权属。此发布要求不代表已取得第三方素材授权，记录见 ASSET-SOURCES.md
- **站名变更史**：LMDB → 炉MDB → LUDB（用户定名 LUDB）

## 文件结构

```
LMDB/                    ← 文件夹名保留 LMDB（历史原因），站点名是 LUDB，不要"顺手统一"
├── index.html           页面骨架：顶栏 + 首页视图 + 详情视图容器
├── data.js              唯一数据源。加片/改片/改评分只动这里
├── assets/css/lmdb.css  设计系统（颜色/字号/间距变量集中在 :root）
├── assets/js/lmdb.js    渲染、hash 路由、交互
├── assets/posters/      真实海报（2:3 竖版 jpg）
│   └── _placeholder-svg/  本机历史归档，Git 和部署均排除，不擅自删除
├── tools/
│   ├── serve.mjs        本地预览服务（node tools/serve.mjs，默认 8765）
│   ├── fetch-poster.mjs 豆瓣海报抓取工具
│   ├── validate-data.mjs 数据与图片路径校验
│   ├── backend.test.mjs 本机服务与抓图回归
│   ├── build.mjs        校验并生成 dist 发布包
│   └── smoke-test.mjs   冒烟测试
├── README.md            使用说明（面向用户）
├── RATINGS-SOURCES.md   外部评分快照依据与限制
├── ASSET-SOURCES.md     图片来源记录与权属说明
├── UI-REVIEW.md         2026-10-02 界面优化验收历史
├── vercel.json          Vercel 构建与输出目录配置
├── .gitignore           本地配置、临时文件和历史归档排除
├── dist/                生成的部署输出，不入 Git
└── AGENTS.md            本文件
```

## 改代码前的红线

1. **命名不要"顺手统一"**：`window.LMDB` 是 data.js 的全局变量名、`lmdb.css`/`lmdb.js` 是文件名、文件夹叫 LMDB——都是历史命名，改任何一处都会断引用或制造混乱。站点显示名（LUDB）在 `index.html`、`lmdb.js` 的 `document.title`、页脚等处，改站名只动那些。
2. **设计语言**：黑白灰铺底（#080808–#2b2b2b 灰阶）+ 黄 `#F5C518` 只用于三处——评分徽章、当前选中态、hover 边线。新增黄色用法前先问"这是不是重点信息"。
3. **字体**：Helvetica Neue 粗细层级 900（片名/数字）/ 400（正文）/ 300（简介长文），中文回退 PingFang SC。粗细对比是这个站的设计骨架。
4. **无障碍红线**（已达标，别打破）：文字对比度 ≥4.5:1、可点元素触控目标 ≥44px、`:focus-visible` 黄色描边、支持 `prefers-reduced-motion`。改动后如涉及颜色，要实算对比度不要目测。
5. **动效**只用 opacity / transform，时长 150–280ms，退出比进入快。
6. **响应式**：桌面与 390px 手机两档都要看。移动端断点在 860px / 420px。

## 踩过的坑（改相关代码前看一眼）

- **顶栏高度不固定**：JS `measureAppBar()` 实测后写 CSS 变量 `--appbar-h`，详情页 sticky 返回条与锚点偏移都读它。旧版 69px／131px 已不适用；改顶栏结构必须重测。
- **`scroll-behavior: smooth` 会覆盖 `scrollTo({behavior:"auto"})`**。恢复滚动位置/锚点跳转必须走 `scrollInstantly()`（临时把 `html.style.scrollBehavior` 置 auto）。
- **`markedAt: null`（未标日期的片）**：按标记时间排序视为最旧垫底（`|| "0000-00-00"`），界面显示"—"，详情页不显示"标记于"。不要用 `String(null)` 比较——`"null"` 会让无日期的片错排到最新。
- **详情页返回文案/面包屑/顶栏高亮跟随来源板块**（`state.detailSource`）：从榜单进显示"返回排行榜"，从海报墙进显示"返回海报墙"，深链直达默认按排行榜。
- **榜单名次只计算 `scoreStatus: "rated"`**（按 `myScore` 降序，同分按年份新的在前）；待评没有名次。两处列表默认按 IMDb 排，切换查看顺序不改个人排名。首屏有真实评分时取榜首，否则取数据第一部。
- **海报展示副本**：`posterPreview`／`posterThumb` 通过 srcset 显示，换原海报时必须一并更新或移除副本字段，避免浏览器继续显示旧图。
- **海报选材（用户 2026-10-02 确认）**：默认优先单片官方正式发行／院线主海报，可采用正式重映版；避开影展合集、周年统一模板、影碟封面和同人图。不能只因来自官方网站或豆瓣默认封面就选用；核对图片版本、片名和出处，原产国或中文发行版按清晰度与画面适配选择，记录到 ASSET-SOURCES.md。
- **Chrome headless 的 `--window-size` 小于 500px 会被忽略**——测移动端必须用 CDP `Emulation.setDeviceMetricsOverride`，不要相信小窗口截图。

## 常见任务

### 加一部新片

1. `data.js` 的 `movies` 数组复制一个对象。字段说明见 README；用户未给个人评分时 `myScore: null`、`scoreStatus: "unrated"`，未给日期时 `markedAt: null`。
2. 抓海报：
   ```bash
   node tools/fetch-poster.mjs "片名" 年份 --alt "导演名" -o assets/posters/<id>.jpg
   ```
   - `--alt` 兜底词（导演名）建议都带：部分片名直搜返回空（《海街日记》《步履不停》都这样）
   - 空结果可能是限流，不能单凭 `[]` 断定原因；工具已内置退避重试，请检查报错与匹配条件，避免反复抓取
3. 刷新页面，确认榜单、海报墙、详情页三处都正常。

### 改完之后必须验证

```bash
node tools/serve.mjs          # 起服务（已在跑则跳过）
node tools/validate-data.mjs
node --test tools/backend.test.mjs
node tools/build.mjs
node tools/smoke-test.mjs     # 冒烟测试（需本机 Chrome）
```

smoke-test 覆盖：品牌名、影片数（动态读 data.js，加片不用改脚本）、海报全部加载、详情路由、后退、搜索高亮、无 JS 异常。**退出码 0 = 全过**。
小改动最低限度也要：curl 各资源 200 + 打开页面看控制台无报错，并在汇报里如实写"查了什么、过了没"。

### 本地预览

```bash
# 在仓库根目录运行
node tools/serve.mjs
```

**不要用 `python -m http.server`**（用户机器上会卡死）。端口被占可 `PORT=8766 node tools/serve.mjs`。

### 重启网页（用户说"重启一下网页"时）

1. `lsof -nP -iTCP:8765 -sTCP:LISTEN` 查端口
2. 有旧进程就 `kill <pid>`，然后 `node tools/serve.mjs` 后台拉起
3. curl 首页与海报各 200，跑一遍 smoke-test

## 用户协作偏好（本项目实测）

- 中文、极简、不用 emoji。指令很短（"加入XX""重启一下网页""改成LUDB"），**直接执行，不反问、不要中间确认**。
- 不满意会直接纠正（常附截图），此时先按新指令回退重做再给结果。
- 汇报结论先行：做了什么、验证结果、待用户决定的事项，三块说清，不写长过程。
- 改动范围对齐指令：让改 A 就只改 A；发现相关问题另列说明，不混进交付。
- 事实要查证：片名/导演/年份这类信息以豆瓣等来源核实后录入，用户记错时如实说明并给正确信息。

## Git 与发布

- 默认分支 `main`；提交前检查暂存文件，不把 `.codex/`、`.agents/`、`.vercel/`、环境变量、临时备份和旧海报归档入库
- Vercel 使用 Other 预设，执行 `node tools/build.mjs`，仅发布 `dist/`；不运行本机 `serve.mjs`
- hash 路由不需要 SPA rewrite；不要把所有未知路径重写到首页掩盖资源错误
- 上线后使用 `BASE_URL=https://实际域名/ node tools/smoke-test.mjs`，并实际查看桌面与 390px 手机画面
- GitHub 仓库可见性、Vercel 构建成功和线上页面可用分别验证，不把本地测试作为线上验收
- 2026-10-02 首次上线：线上冒烟 51/51、本机服务回归 24/24；43 个线上文件逐字节匹配，维护文件返回 404；后续修改按影响范围复核

## 当前数据状态（2026-10-02 核对）

- 共 **12 部影片**：小偷家族、海街日记、步履不停、奇迹、星际穿越、奥本海默、盗梦空间、银翼杀手2049、蓦然回首、情书、花与爱丽丝、四月物语
- 全部 `myScore: null`、`scoreStatus: "unrated"`，显示待评；此状态替代旧版占位评分
- 仅《奥本海默》2026-09-19、《盗梦空间》2026-09-22 来自用户原始清单；其余五个非空日期仍是历史占位，另五部为 null。不要当作已证实观影日期
- IMDb／豆瓣为手工录入的历史快照，来源与限制见 RATINGS-SOURCES.md；《四月物语》豆瓣分仍待源站复核
- **review（短评）全部为空**，用户填了才会显示在详情页
- 《蓦然回首》导演是**押山清高**（改编自藤本树短篇的 58 分钟动画）——用户曾误记为是枝裕和，已按事实录入；若用户要求改回，先说明事实
- Logo 原图中文字为 LMDB，站点显示名保持 LUDB；原图和展示副本均保留
