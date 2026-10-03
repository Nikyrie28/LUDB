# 图片来源与权属

本文件整理现有项目记录，不是授权证明。海报版权属于电影发行方及其他相应权利人；公开仓库不为这些第三方素材授予再使用许可，注明来源也不等于已取得授权。

## 电影海报

| 文件 ID | 影片 | 来源记录 |
| --- | --- | --- |
| shoplifters | 小偷家族 | 豆瓣影片条目 |
| umimachi | 海街日记 | 豆瓣影片条目 |
| aruitemo | 步履不停 | 豆瓣影片条目 |
| kiseki | 奇迹 | 豆瓣影片条目 |
| interstellar | 星际穿越 | 豆瓣影片条目 |
| oppenheimer | 奥本海默 | 豆瓣影片条目 |
| inception | 盗梦空间 | 豆瓣影片条目 |
| blade-runner-2049 | 银翼杀手2049 | 豆瓣影片条目 |
| look-back | 蓦然回首 | 豆瓣影片条目 |
| love-letter-cn-2021 | 情书 | 2021 年中国内地重映定档海报；豆瓣收录 |
| hana-and-alice-jp | 花与爱丽丝 | 日本单片发行海报；映画.com 海报页 |
| april-story-jp | 四月物语 | 日本单片发行海报；映画.com 海报页 |

豆瓣对应条目链接保存在 [data.js](data.js) 的 `doubanUrl`。前九部的来源依据已有维护文档和数据注释，原始图片下载 URL、下载日期未保留，不补猜。

## 2026-10-02 岩井俊二三部换图

默认优先单片官方正式发行／院线主海报，可用正式重映版；不再优先采用周年统一模板。此次新图均保留完整画面，仅生成等比例缩小副本。

- **情书**：雪中仰头的中文发行海报，标有「5.20 亲启告白」及发行信息。[原图](https://img3.doubanio.com/view/photo/l_ratio_poster/public/p2648230660.jpg)；[2021-04-29 定档报道](https://www.dianyingjie.com.cn/2021/0429/245833.shtml)明确介绍这一画面为全国院线重映定档海报。1080 × 1542
- **花与爱丽丝**：双人上下对置、含片名和演职员信息的日本版。[海报页](https://eiga.com/movie/1416/photo/)标注 ©2004 Rockwell Eyes・H＆A Project；[原图](https://media.eiga.com/images/movie/1416/photo/3555829821dd7be7.jpg)。564 × 800。未采用豆瓣默认的「特别版」封面
- **四月物语**：松隆子手持场记板的紫色三段影像日本版。[海报页](https://eiga.com/movie/13991/photo/)标注 ©1998 ROCKWELL EYES INC.；[原图](https://media.eiga.com/images/movie/13991/photo/739e1904f6f8f28e.jpg)。566 × 800

后两张由电影资料站海报栏目收录，未找到发行方保存的原始高清下载页，不声称是发行方原始文件。尺寸足够现有详情页及 512px／256px 展示副本。

**旧版**：`love-letter.jpg`、`hana-and-alice.jpg`、`april-story.jpg` 及各自 display／thumb 副本，是 [IWAI SHUNJI The Film Works 30th Anniversary 1995–2025](https://iwaifilm30th.com/) 特集上映系列。原文件继续保留，当前 data.js 已不引用，build 不复制到 dist；需要恢复时须同时恢复三种图片字段。

`*-display.jpg` 与 `*-thumb.jpg` 是同一原海报的缩小展示副本，不是新的授权素材。最早的占位 SVG 只在本机归档，不进入本仓库或部署。

## Logo

`assets/logo.png` 为站点所有者提供的原始图片，`assets/logo-display.png` 为等比例缩小副本。图中文字为 LMDB，网站显示名称为 LUDB。

## 2026-10-02 详情页剧照

`assets/backdrops/<id>.jpg` 用于电影详情顶部背景，与竖版海报独立。下列图片均经画面核对；不是 AI 生成图。岩井俊二三部使用影片剧照，不使用周年海报模板。原始下载暂存于本机 `/tmp/ludb-stills-originals/`，可按下列原图入口重新取得；站内副本仅等比例缩小（宽度上限 1920px）并转存渐进式 JPEG，未调色、未将蒙版烘焙进图片。裁切、暗角及渐隐由 CSS 实现。

| 文件 ID | 影片 / 画面 | 来源页 | 图片入口 |
| --- | --- | --- | --- |
| shoplifters | 小偷家族：一家人在海边跃起 | [Magnolia Pictures](https://www.magpictures.com/presskit.aspx?id=fcf965ec-d277-4152-bd60-915b74501cc2) | [原始下载](https://www.magpictures.com/resources/presskits/Shoplifters/12.jpg) |
| umimachi | 海街日记：四姐妹放烟花 | [Sony Pictures Classics](https://www.sonyclassics.com/ourlittlesister/) | [原始下载](https://www.sonyclassics.com/ourlittlesister/img/gallery/1.jpg) |
| aruitemo | 步履不停：一家人围桌吃饭 | [Criterion](https://www.criterion.com/films/27540-still-walking) | [原始下载](https://criterion-production.s3.amazonaws.com/carousel-files/e2672c0ddd4c6e940edb0a34057309d5.jpeg) |
| kiseki | 奇迹：兄弟在铁轨旁背向站立 | [Magnolia Pictures](https://www.magpictures.com/presskit.aspx?id=388775a0-8443-41a8-8ff6-57b5b3a27c94) | [原始下载](https://www.magpictures.com/resources/presskits/IWish/1.jpg) |
| interstellar | 星际穿越：宇航员行走在岩石地形中 | [BFI](https://www.bfi.org.uk/features/where-begin-with-christopher-nolan) | [原始下载](https://core-cms.bfi.org.uk/sites/default/files/2023-04/interstellar-2014-wide-shot-four-astronauts-ascending-rocky-landscape.jpeg) |
| oppenheimer | 奥本海默：戴护目镜望向实验装置 | [BFI / Sight and Sound](https://www.bfi.org.uk/sight-and-sound/reviews/oppenheimer-nolans-dazzling-expressionistic-flourishes-bring-this-sombre-chamber-drama-life) | [原始下载](https://core-cms.bfi.org.uk/sites/default/files/styles/responsive/public/2023-07/oppenheimer-2023-oppenheimer-wearing-goggles-looking-into-a-light.jpg/1300x0/oppenheimer-2023-oppenheimer-wearing-goggles-looking-into-a-light.jpg) |
| inception | 盗梦空间：旋转走廊场景 | [BFI](https://www.bfi.org.uk/features/where-begin-with-christopher-nolan) | [原始下载](https://core-cms.bfi.org.uk/sites/default/files/2020-08/inception-2010-escher-corridor.jpg) |
| blade-runner-2049 | 银翼杀手2049：橙色光线中的飞行车 | [Warner Bros.](https://www.warnerbros.com/movies/blade-runner-2049) | [原始下载](https://irs.www.warnerbros.com/hero-banner-jpeg/movies/media/browser/blade_runner_2049_banner.jpg) |
| look-back | 蓦然回首：两人坐在列车中 | [GKIDS](https://gkids.com/films/look-back/) | [原始下载](https://gkids.com/wp-content/themes/2025/template-parts/film-series/landing-page/LOOKB/assets/images/LOOKB_Still_02.png) |
| love-letter | 情书：室内读信 | [岩井俊二作品官方展映网站](https://iwaifilm30th.com/archives/lineup/love-letter-4k) | [原始下载](https://iwaifilm30th.com/wp-content/uploads/2025/12/Love-Letter-01.jpg) |
| hana-and-alice | 花与爱丽丝：两人在台阶前同行 | [岩井俊二作品官方展映网站](https://iwaifilm30th.com/archives/lineup/hana-and-alice) | [原始下载](https://iwaifilm30th.com/wp-content/uploads/2025/12/HA_004_hd.jpg) |
| april-story | 四月物语：红伞下的松隆子 | [岩井俊二作品官方展映网站](https://iwaifilm30th.com/archives/lineup/aprilstory) | [原始下载](https://iwaifilm30th.com/wp-content/uploads/2025/12/april_sub_01-scaled.jpg) |

版权属于电影制作方、发行方及其他相应权利人。发行方发布或媒体收录的剧照不等于取得本站再发布授权；本记录用于说明素材来源，不赋予开放许可。
