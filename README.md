# LUDB

[在线访问](https://ludb.vercel.app/) · [GitHub 公开仓库](https://github.com/Nikyrie28/LUDB)

个人电影收藏与观影记录站。包含排行榜、海报墙、搜索、筛选与影片详情，使用黑白灰和黄色重点的 Helvetica 设计。

原生 HTML / CSS / JavaScript，零运行时依赖，无数据库服务。当前收录 12 部影片，个人评分均为「待评」；IMDb／豆瓣分数为手动录入的历史快照。

## 打开

双击 `index.html` 就能看。或起个本地服务：

```bash
# 在仓库根目录运行，需要 Node.js 22 或更新版本
node tools/serve.mjs
# 打开 http://localhost:8765
```

> 这个文件夹里有一份 `AGENTS.md`（维护手册）。在 Codex / ZCode 里把这个文件夹当工作目录打开，AI 会自动读到它，直接下指令就能维护。

## GitHub 与 Vercel

部署配置保存在 [vercel.json](vercel.json)。在 Vercel 导入本仓库后使用以下配置，无须安装依赖或填写环境变量：

| 设置 | 值 |
| --- | --- |
| Framework Preset | Other |
| Root Directory | 仓库根目录 |
| Build Command | `node tools/build.mjs` |
| Output Directory | `dist` |
| Install Command | 留空 |
| Production Branch | `main` |

发布脚本先校验数据与图片，再将网页、脚本、样式、Logo 和影片实际引用的海报复制到 `dist/`。文档、维护工具、本地配置和历史海报归档不会成为站点静态资源。源码仍在根目录维护，不要直接编辑 `dist/`。

连接 GitHub 后，推送 `main` 会触发生产部署；详情页使用 hash 路由，无须添加 SPA rewrite。配置依据：[Vercel 构建设置](https://vercel.com/docs/builds/configure-a-build)、[Git 集成](https://vercel.com/docs/git)。

本地生成发布包及验证线上版本：

```bash
node tools/build.mjs
BASE_URL=https://ludb.vercel.app/ node tools/smoke-test.mjs
```

`.gitignore` 排除本机配置、凭据、构建输出和历史归档；公开仓库中的 `data.js` 本身是公开数据，请勿写入私人信息。

首次上线验收（2026-10-02）：数据校验与本机服务回归 24/24、线上浏览器冒烟 51/51 通过；43 个线上文件与本地源文件逐字节一致。桌面 1440px 与手机 390px 画面已查看；维护文件和旧素材归档返回 404。这是本次部署验证，不代表后续版本或所有访问地区的持续可用性。

## 页面结构

站点是「一个首页 + 一个全屏详情页」两级结构，靠 URL 里的 `#` 路由切换，浏览器后退键和深链都能正常工作。

| 路由 | 页面 |
| --- | --- |
| `#/` | 首页（首屏精选 + 排行榜 + 海报墙 + 关于） |
| `#chart` `#wall` `#about` | 首页内锚点 |
| `#/film/inception` | 《盗梦空间》全屏详情页 |

详情页可以直接分享链接，打开就是那一部片。返回首页时滚动位置会回到你点进去之前的位置。

## 功能

| 区块 | 说明 |
| --- | --- |
| 首屏精选 | 有真实评分时取榜单第 1 名；尚无真实评分时展示收藏中的第一部影片 |
| 排行榜 | 每行展示缩略海报、影片信息和三种评分；有个人评分时显示名次。可按 IMDb、豆瓣、个人评分、年份排序 |
| 海报墙 | 自适应栅格，评分与个人状态放在海报下方，悬停轻微放大海报。可按类型筛选，并按 IMDb、豆瓣、个人评分、年份排序 |
| 搜索 | 顶栏搜索框，匹配片名 / 导演 / 类型 / 主演 / 国家，命中处黄色高亮 |
| 详情页 | 全屏二级页面：主视觉海报 + 标题信息 + 剧情 / 短评 + 右侧信息卡 + 上下名跳转 |

详情页里的操作：
- 顶部「返回排行榜」按钮（按钮文案跟随你从哪个板块进来）
- 面包屑 `LUDB / 排行榜 / 片名`
- 底部「上一部 / 下一部」在收藏中切换，已评分影片优先
- 键盘 `←` `→` 也可以切换影片
- 浏览器后退键直接返回首页原位置

## 改数据

只动 `data.js` 一个文件。加一部电影 = 复制一个 `{ }` 对象：

```js
{
  id: "inception",              // 唯一标识，英文小写，不要重复
  title: "盗梦空间",             // 中文片名（显示用）
  originalTitle: "Inception",   // 原名
  enTitle: "Inception",         // 英文名（与原名相同则自动只显示一个）
  year: 2010,
  director: "克里斯托弗·诺兰",
  cast: ["莱昂纳多·迪卡普里奥", "约瑟夫·高登-莱维特"],
  genres: ["科幻", "悬疑", "动作"],   // 海报墙的筛选按钮由这里自动生成
  country: "美国",
  runtime: 148,                 // 分钟
  myScore: null,                // 尚未评分；真实评分为 0–10
  scoreStatus: "unrated",         // rated 真实评分 / placeholder 占位 / unrated 未评分
  imdbScore: 8.8,               // 外部评分快照，无可核实分数时填 null
  doubanScore: 9.4,
  imdbUrl: "https://www.imdb.com/title/tt1375666/",
  doubanUrl: "https://movie.douban.com/subject/3541415/",
  markedAt: "2026-09-22",       // 标记日期，YYYY-MM-DD
  poster: "assets/posters/inception.jpg",
  tagline: "一颗念头的重量。",     // 首页精选的简短介绍
  summary: "剧情简介……",
  review: "",                   // 你的短评，留空则显示提示文案
}
```

### 换海报

海报按 **2:3 竖版容器**展示，当前有 12 张真实海报，来源包括豆瓣与岩井俊二官方影展；原图比例可能略有不同。

1. 把自己的图用新文件名放进 `assets/posters/`，保留原图
2. 把该片的 `poster` 改成对应路径，例如 `assets/posters/inception.jpg`

> 之前的极简 SVG 占位图归档在 `assets/posters/_placeholder-svg/`，
> 仅保留在本机，不进入 Git 和部署。它们的画布也是 2:3，可作换图时的尺寸参考。

抓图用现成工具（不需要手写 curl）：

```bash
node tools/fetch-poster.mjs "星际穿越" 2014 -o assets/posters/interstellar.jpg

# 片名搜不到时用导演名兜底（《海街日记》《步履不停》都必须这样）
node tools/fetch-poster.mjs "海街日记" 2015 --alt 是枝裕和 -o assets/posters/umimachi.jpg
```

工具仅接受片名、年份、影片类型均匹配的结果，校验 JPEG 标记与尺寸后保存。旧文件不会被覆盖；换图请使用新的输出文件名，再改 `poster` 路径。
空结果会退避重试，每次网络请求最长 15 秒。
批量加片见 `node tools/fetch-poster.mjs --help`。

> 空结果可能是限流，也可能未匹配片名、年份或类型。先查看报错，不把空数组直接当作影片不存在。

### 评分与排序

- 榜单与海报墙默认按 IMDb 降序；两处都支持独立切换豆瓣、个人评分、年份。外部评分相同按年份降序，再按 ID；缺少外部分数的影片排末尾
- IMDb／豆瓣为手动录入的公开页面收录快照，不自动更新；部分豆瓣收录较旧，详情链接可查最新值。录入日期不代表源站当天分数，完整依据见 [RATINGS-SOURCES.md](RATINGS-SOURCES.md)
- 《四月物语》豆瓣分来自新浪电影博主 2026-03-27 的转述，已在详情标注待源站复核

- 只有 `scoreStatus: "rated"` 的真实评分参与排名；占位或未评分影片显示「待评」，没有名次
- 填写真实评分时同时修改 `myScore` 与 `scoreStatus: "rated"`；不需要占位数值时使用 `myScore: null`、`scoreStatus: "unrated"`
- 排行榜名次始终按真实 `myScore` 算，和当前查看排序方式无关
- 同分时按年份新的排前面
- 名次会同步到首屏标题区、海报下方和详情页的「我的第 N 名」
- 按评分查看时，待评影片排在已评分影片后，待评影片之间按年份新到旧展示

### 数据校验与本地服务

```bash
node tools/validate-data.mjs
node --test tools/backend.test.mjs
node tools/build.mjs
node tools/smoke-test.mjs
```

校验会检查重复 ID、必填信息、评分状态与 0–10 范围、有效日期和海报路径／文件。服务启动及每次读取 `data.js` 时也会校验，错误会在终端指出，数据修复后刷新即可。

服务只监听 `127.0.0.1`，仅允许 GET / HEAD 读取首页、数据、固定样式／脚本／图标及 `assets/posters/` 下的图片。维护文件、隐藏目录和海报归档不可通过网页读取。

## 文件结构

```
LMDB/                          （文件夹名保持不变，站点叫「LUDB」）
├── index.html                 页面骨架（首页 + 详情页两个视图容器）
├── data.js                    ← 加片改片只动这个
├── AGENTS.md                  AI 维护手册（Codex/ZCode 打开本目录会自动读）
├── README.md                  本文件
├── RATINGS-SOURCES.md         外部评分快照依据
├── ASSET-SOURCES.md           图片来源记录与权属说明
├── UI-REVIEW.md               界面优化历史验收记录
├── vercel.json                Vercel 部署配置
├── .gitignore                 Git 排除项
├── .vercelignore              CLI 上传排除项
├── dist/                      发布输出（自动生成，不入 Git）
├── assets/
│   ├── css/lmdb.css           设计系统（颜色/字号/栅格都在顶部变量里）
│   ├── js/lmdb.js             渲染、交互与路由
│   ├── favicon.svg            标签页图标（黄底「LU」）
│   └── posters/               电影海报（2:3 jpg）
│       └── _placeholder-svg/  本机历史归档，不入 Git
└── tools/
    ├── serve.mjs              本地预览服务
    ├── fetch-poster.mjs       豆瓣海报抓取
    ├── validate-data.mjs      数据与海报文件校验
    ├── backend.test.mjs       服务与下载保护回归检查
    ├── build.mjs              校验并打包公开站点文件
    └── smoke-test.mjs         冒烟测试（改完代码跑一遍）
```

## 设计口径

- **字体**：Helvetica Neue → Helvetica → PingFang SC 回退链。900 用于片名与数字，400 常规，300 用于简介这类长文本
- **颜色**：黑 `#080808`–`#2b2b2b` 的灰阶铺底，文字 `#ececec` 到 `#8a8a8a` 分级
- **黄** `#F5C518`：只给三类重点——评分徽章、当前选中态、hover 时的边线。其余一律黑白灰
- 想调整整体色调，改 `assets/css/lmdb.css` 顶部 `:root` 里的变量即可

### 无障碍与可用性

按 ui-ux-pro-max 的规则做过一轮：
- 所有文字对比度达到 WCAG AA（4.5:1）以上
- 所有可点控件触控目标 ≥44px
- 键盘可完整操作：`Tab` 遍历、`Enter` 进入、`Esc`/后退返回、`←` `→` 翻片
- 页面顶部有「跳到主要内容」链接
- 进入详情页时焦点自动移到标题，并更新 `document.title`
- 支持 `prefers-reduced-motion`，系统开启减弱动效时动画自动关闭

## 待办

- 用户已确认尚无个人评分：12 部影片均为 `myScore: null`、`scoreStatus: "unrated"`，页面显示「待评」；之后可填写真实评分并改为 `rated`
- `markedAt` 中《奥本海默》26.09.19、《盗梦空间》26.09.22 来自你的清单，其余五部是按顺序补的占位日期
- `review` 全部留空，写了才会在详情里出现

Logo 使用用户提供的原始 PNG（图中文字为 LMDB），站点既定显示名仍为 LUDB。原图保留，顶栏和标签页使用等比例缩小的 `logo-display.png` 展示副本。

## 图片与维护记录

2026-10-02 界面优化的范围和历史测试记录见 [UI-REVIEW.md](UI-REVIEW.md)。其中的本机测试不代表线上实测。

海报原图由 `poster` 引用；可选 `posterPreview`（512px 宽）和 `posterThumb`（256px 宽）通过 `srcset` 提供展示副本，浏览器按尺寸选择。换海报时需同时更换或删除这两个可选字段，否则仍会显示旧副本。校验工具检查三个字段的路径与文件。原图均保留。

海报来源包括豆瓣影片条目及岩井俊二官方影展，版权属于各自权利人；仓库公开不代表第三方素材获得开放许可，署名也不等于取得授权。图片记录见 [ASSET-SOURCES.md](ASSET-SOURCES.md)，评分出处与证据限制见 [RATINGS-SOURCES.md](RATINGS-SOURCES.md)。
