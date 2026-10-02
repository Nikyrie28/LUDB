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
