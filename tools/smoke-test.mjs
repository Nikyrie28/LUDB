#!/usr/bin/env node
/* =========================================================================
   LUDB 冒烟测试
   -------------------------------------------------------------------------
   用法：
     1. 先起服务：  node tools/serve.mjs
     2. 再跑测试：  node tools/smoke-test.mjs

   依赖本机 Chrome（macOS 路径，可用 CHROME 环境变量覆盖）。
   影片数从 data.js 动态读取，加片不需要改本脚本。
   ========================================================================= */
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMovieData } from "./validate-data.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT) || 8765;
const BASE = new URL(process.env.BASE_URL || `http://localhost:${PORT}/`).href;
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CDP_PORT = 9370;

const db = await loadMovieData(ROOT);
const N_MOVIES = db.movies.length;
const rated = db.movies.filter(m => m.scoreStatus === "rated").sort((a, b) => b.myScore - a.myScore || b.year - a.year);
const expectedHero = rated[0] || db.movies[0];

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", `--remote-debugging-port=${CDP_PORT}`,
  "--no-first-run", "--user-data-dir=/tmp/lmdb-smoke-" + CDP_PORT, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let page;
for (let i = 0; i < 60; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    page = l.find((x) => x.type === "page");
    if (page) break;
  } catch {}
  await sleep(300);
}
if (!page) { console.error("✗ Chrome headless 未就绪"); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
const problems = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown")
    problems.push("异常: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error")
    problems.push("控制台: " + m.params.entry.text);
});
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr, awaitPromise = false) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise });
  return r.result?.result?.value;
};

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log((pass ? "  PASS  " : "  FAIL  ") + name + (detail ? "  → " + detail : ""));
};

/* 1. 首页结构 */
await send("Page.navigate", { url: BASE + "?t=" + Date.now() });
await sleep(2600);
const home = JSON.parse(await ev(`JSON.stringify({
  brand: document.querySelector(".brand")?.getAttribute("aria-label"),
  logo: document.querySelector(".brand__logo")?.getAttribute("src"),
  rows: document.querySelectorAll(".chart__row").length,
  cards: document.querySelectorAll(".card").length,
  heroTitle: document.querySelector(".hero__title")?.textContent,
  heroBackdrop: document.querySelector(".hero__backdrop img")?.getAttribute("src"),
  heroBackdropLoaded: !!document.querySelector(".hero__backdrop img")?.naturalWidth,
  heroExtras: !!document.querySelector(".hero__meta,.hero__cta,.hero__collection-link"),
  heroEyebrow: document.querySelector(".hero__eyebrow")?.textContent,
  rankedCards: document.querySelectorAll(".card__rank").length,
  pendingScores: document.querySelectorAll(".card__score.is-pending").length,
  title: document.title,
  titles: [...document.querySelectorAll(".card__title")].map(t => t.textContent),
})`));
check("站点品牌为 LUDB", home.brand === "LUDB 首页" && home.logo === "assets/logo.png", home.brand);
check(`排行榜 ${N_MOVIES} 行`, home.rows === N_MOVIES, "rows=" + home.rows);
check(`海报墙 ${N_MOVIES} 张`, home.cards === N_MOVIES, "cards=" + home.cards);
check("首屏影片与数据一致", home.heroTitle === expectedHero?.title, home.heroTitle);
check("首屏横幅与影片对应且加载成功", expectedHero?.backdrop ? home.heroBackdrop === expectedHero.backdrop && home.heroBackdropLoaded : !home.heroBackdrop, home.heroBackdrop);
check("首屏不显示元信息行及操作入口", !home.heroExtras);
check("首屏只对真实评分显示榜首", home.heroEyebrow === (rated.length ? "我的第 1 名" : "影片收藏"), home.heroEyebrow);
check("只有真实评分影片显示名次", home.rankedCards === rated.length, "ranked=" + home.rankedCards);
check("占位及未评分影片显示待评", home.pendingScores === N_MOVIES - rated.length, "pending=" + home.pendingScores);
check("标签页标题包含 LUDB", (home.title || "").includes("LUDB"), home.title);

/* 2. 海报全部加载（滚动到底触发 lazy） */
await ev(`window.scrollTo(0, document.body.scrollHeight)`);
await sleep(1800);
const imgs = JSON.parse(await ev(`JSON.stringify(
  [...document.images].map(i => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0 }))
)`));
const broken = imgs.filter((i) => !i.ok);
check("全部海报加载成功", broken.length === 0,
  broken.length ? broken.map((b) => b.src).join(", ") : imgs.length + " 张全部正常");

/* 3. 详情页（取 data.js 里第一部片验证路由） */
const firstId = db.movies[0].id;
await ev(`location.hash = "#/film/${firstId}"`);
await sleep(900);
const detail = JSON.parse(await ev(`JSON.stringify({
  shown: !document.getElementById("viewDetail").hidden,
  hidden: document.getElementById("viewHome").hidden,
  title: document.querySelector(".detail__title")?.textContent,
  crumbs: document.querySelector(".detail__crumbs a")?.textContent,
  docTitle: document.title,
  scoreNote: document.querySelector(".detail__score-note")?.textContent,
})`));
check("详情页全屏打开", detail.shown && detail.hidden, "hash=#/film/" + firstId);
check("详情标题与目标影片一致", detail.title === db.movies[0].title, detail.title);
check("面包屑品牌为 LUDB", detail.crumbs === "LUDB", detail.crumbs);
check("document.title 已更新", (detail.docTitle || "").includes(detail.title || "#"));
check("无日期时不出现「标记于 —」", !/标记于\s*—/.test(detail.scoreNote || ""), detail.scoreNote);

/* 4. 浏览器后退回首页 */
await ev(`history.back()`);
await sleep(900);
const back = JSON.parse(await ev(`JSON.stringify({
  home: !document.getElementById("viewHome").hidden,
  detailHidden: document.getElementById("viewDetail").hidden,
})`));
check("后退返回首页", back.home && back.detailHidden);

/* 5. 搜索（用库里已有导演名验证） */
const director = db.movies[0].director;
await ev(`(() => {
  const i = document.getElementById("searchInput");
  i.value = ${JSON.stringify(director)};
  i.dispatchEvent(new Event("input", { bubbles: true }));
})()`);
await sleep(500);
const search = JSON.parse(await ev(`JSON.stringify({
  count: document.querySelectorAll(".card").length,
  marks: document.querySelectorAll("mark").length,
})`));
check(`搜索「${director}」有结果`, search.count > 0, "count=" + search.count);
check("命中处有高亮", search.marks > 0, "mark=" + search.marks);

/* 6. 每部影片的详情与数据一一对应，避免仅检查页面已打开。 */
for (const movie of db.movies) {
  await ev(`location.hash = ${JSON.stringify("#/film/" + movie.id)}`);
  await sleep(350);
  await ev(`Promise.all([...document.querySelectorAll("#viewDetail img")].map(i => i.decode()))`, true);
  const actual = JSON.parse(await ev(`JSON.stringify({
    title: document.querySelector(".detail__title")?.textContent,
    poster: document.querySelector(".detail__poster img")?.getAttribute("src"),
    summary: document.querySelector(".detail__text")?.textContent,
    score: document.querySelector(".detail__score-num")?.textContent,
    note: document.querySelector(".detail__score-note")?.textContent,
    backdrop: document.querySelector(".detail__backdrop img")?.getAttribute("src"),
    backdropLoaded: !!document.querySelector(".detail__backdrop img")?.naturalWidth,
  })`));
  const expectedScore = movie.scoreStatus === "rated" ? movie.myScore.toFixed(1) : "待评";
  check(`《${movie.title}》详情、海报与评分状态对应`, actual.title === movie.title && actual.poster === movie.poster && actual.summary === movie.summary && actual.score === expectedScore && (movie.markedAt !== null || !/标记于/.test(actual.note)), actual.title);
  check(`《${movie.title}》剧照对应且加载成功`, movie.backdrop ? actual.backdrop === movie.backdrop && actual.backdropLoaded : !actual.backdrop);
}

/* 外部评分和两处排序在桌面、手机均应按数值降序。 */
for (const width of [1440, 390]) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 });
  await send("Page.navigate", { url: BASE });
  await sleep(600);
  for (const source of ["imdb", "douban"]) {
    const expected = db.movies.slice().sort((a,b) => (b[source + "Score"] ?? -1) - (a[source + "Score"] ?? -1) || b.year-a.year || a.id.localeCompare(b.id)).map(m=>m.title);
    await ev(`document.querySelector('[data-sort="${source}"]').click(); document.querySelector('#wallSort').value='${source}'; document.querySelector('#wallSort').dispatchEvent(new Event('change'));`);
    const actual = JSON.parse(await ev(`JSON.stringify({chart:[...document.querySelectorAll('.chart__title')].map(x=>x.textContent),wall:[...document.querySelectorAll('.card__title')].map(x=>x.textContent),overflow:document.documentElement.scrollWidth>innerWidth})`));
    check(`${width}px ${source} 排行榜与海报墙排序`, JSON.stringify(actual.chart)===JSON.stringify(expected) && JSON.stringify(actual.wall)===JSON.stringify(expected) && !actual.overflow);
  }
  await ev(`location.hash='#/film/${db.movies[0].id}'`); await sleep(300);
  const detailRatings=JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.detail__intro .external-ratings a')].map(a=>({url:a.href,text:a.textContent})))`));
  check(`${width}px 详情展示两种分数及来源`, detailRatings[0]?.url===db.movies[0].imdbUrl && detailRatings[0]?.text.includes(db.movies[0].imdbScore.toFixed(1)) && detailRatings[1]?.url===db.movies[0].doubanUrl && detailRatings[1]?.text.includes(db.movies[0].doubanScore.toFixed(1)));
  for (const movie of db.movies.filter(m => m.backdrop)) {
    await ev(`location.hash=${JSON.stringify('#/film/' + movie.id)}`); await sleep(280);
    const composition = await ev(`(() => {
      const image = document.querySelector('.detail__backdrop').getBoundingClientRect();
      const title = document.querySelector('.detail__title').getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth && title.top >= image.top + image.height * (innerWidth > 700 ? .3 : .75) && title.top < image.bottom && document.activeElement === document.querySelector('.detail__title');
    })()`);
    check(`${width}px《${movie.title}》标题进入首屏、焦点正确且无横向溢出`, composition);
  }
}

/* 横幅首屏与详情的关键路径、缺图降级。 */
for (const width of [1440, 768, 390]) {
  await send("Emulation.setDeviceMetricsOverride", { width, height:900, deviceScaleFactor:1, mobile:width===390 });
  await send("Page.navigate", {url:BASE}); await sleep(450);
  const collectionLink = '#chartList a[href="#/film/' + expectedHero.id + '"]';
  const heroLayout = await ev(`(() => {
    const host=document.querySelector('#hero').getBoundingClientRect();
    const summary=document.querySelector('.hero__summary').getBoundingClientRect();
    const image=document.querySelector('.hero__backdrop img');
    const ratings=document.querySelector('.hero__scores').getBoundingClientRect();
    return host.width===innerWidth && (!image || image.naturalWidth>0) && summary.top>=0 && summary.bottom<=innerHeight && ratings.right<=innerWidth && document.documentElement.scrollWidth<=innerWidth && !document.querySelector('.hero__meta,.hero__cta,.hero__collection-link');
  })()`);
  check(`${width}px 首页简介首屏可见、指定组件已移除且无溢出`, heroLayout);
  await ev(`document.querySelector(${JSON.stringify(collectionLink)}).click()`); await sleep(300);
  check(`${width}px 排行榜入口仍打开对应详情`, await ev(`document.querySelector('.detail__title').textContent===${JSON.stringify(expectedHero.title)} && !document.querySelector('#viewDetail').hidden`));
  await ev(`document.querySelector('.detail__back').click()`); await sleep(300);
  check(`${width}px 详情返回首页恢复原位置`, await ev(`!document.querySelector('#viewHome').hidden && scrollY===0`));
  // Invalid image bytes exercise the real decode/error path without an external request.
  if (expectedHero.backdrop) {
    await ev(`document.querySelector('.hero__backdrop img').src='data:image/jpeg;base64,AA=='`); await sleep(100);
    check(`${width}px 首页剧照损坏时保留标题和简介`, await ev(`!document.querySelector('#hero').classList.contains('has-backdrop') && document.querySelector('.hero__backdrop').hidden && document.querySelector('.hero__title').textContent===${JSON.stringify(expectedHero.title)} && document.querySelector('.hero__summary').textContent===${JSON.stringify(expectedHero.summary)}`));
    await ev(`document.querySelector(${JSON.stringify(collectionLink)}).click()`); await sleep(300);
    await ev(`document.querySelector('.detail__backdrop img').src='data:image/jpeg;base64,AA=='`); await sleep(100);
    check(`${width}px 详情剧照损坏时恢复紧凑布局`, await ev(`!document.querySelector('.detail__hero').classList.contains('has-backdrop') && document.querySelector('.detail__backdrop').hidden && document.querySelector('.detail__title').getBoundingClientRect().top<300`));
  }
}

/* 7. 浏览器内模拟混合评分数据；项目数据文件不变。 */
if (db.movies.length >= 3) {
  const fixture = await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    Object.defineProperty(window, "LMDB", { configurable: true, set(value) {
      value.movies.forEach(m => { m.scoreStatus = "placeholder"; m.myScore = 9.9; });
      value.movies[0].scoreStatus = "rated"; value.movies[0].myScore = 7.5;
      value.movies[1].scoreStatus = "rated"; value.movies[1].myScore = 8.5;
      value.movies[2].imdbScore = null; value.movies[2].doubanScore = null;
      value.movies[3].imdbScore = 0; value.movies[3].doubanScore = 0;
      Object.defineProperty(window, "LMDB", { configurable: true, writable: true, value });
    }});
  ` });
  for (const width of [1440, 390]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 });
    await send("Page.navigate", { url: BASE + "?fixture=" + Date.now() });
    await sleep(700);
    await ev(`document.querySelector('[data-sort="score"]').click()`);
    const mixed = JSON.parse(await ev(`JSON.stringify({
      hero: document.querySelector(".hero__title")?.textContent,
      ranked: document.querySelectorAll(".card__rank").length,
      pending: document.querySelectorAll(".card__score.is-pending").length,
      rows: [...document.querySelectorAll(".chart__row")].slice(0,2).map(r => ({ title:r.querySelector(".chart__title").textContent, rank:r.querySelector(".chart__rank").textContent })),
      overflow: document.documentElement.scrollWidth > innerWidth,
    })`));
    check(`${width}px 混合评分：高占位分不影响真实排名`, mixed.hero === db.movies[1].title && mixed.ranked === 2 && mixed.pending === N_MOVIES - 2 && mixed.rows[0]?.title === db.movies[1].title && mixed.rows[0]?.rank === "1" && mixed.rows[1]?.title === db.movies[0].title && mixed.rows[1]?.rank === "2" && !mixed.overflow, mixed.hero);
    for (const source of ["imdb", "douban"]) {
      await ev(`document.querySelector('[data-sort="${source}"]').click()`);
      const tail = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.chart__title')].slice(-2).map(x=>x.textContent))`));
      check(`${width}px ${source} 缺分排末尾且 0 分有效`, tail[0] === db.movies[3].title && tail[1] === db.movies[2].title);
    }
    await ev(`location.hash=${JSON.stringify("#/film/" + db.movies[2].id)}`);
    await sleep(300);
    const pending = JSON.parse(await ev(`JSON.stringify({score:document.querySelector(".detail__score-num")?.textContent, rank:document.querySelector(".detail__bar-pos")?.textContent})`));
    check(`${width}px 占位影片详情不显示名次`, pending.score === "待评" && pending.rank === "未参与排名");
  }
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: fixture.result.identifier });
  await send("Page.navigate", { url: BASE });
  await sleep(400);
}

/* 页面切换：有真实动画、快速导航无残留、减少动态效果立即生效。 */
for (const width of [1440, 390]) {
  await send("Emulation.setDeviceMetricsOverride", { width, height:900, deviceScaleFactor:1, mobile:width===390 });
  await send("Emulation.setEmulatedMedia", { features:[{name:"prefers-reduced-motion",value:"no-preference"}] });
  await send("Page.navigate", {url:BASE}); await sleep(500);
  await ev(`location.hash='#/film/${firstId}'`); await sleep(70);
  const motion=JSON.parse(await ev(`JSON.stringify({active:document.querySelector('.detail__hero').getAnimations().length,opacity:Number(getComputedStyle(document.querySelector('.detail__hero')).opacity),sticky:document.querySelector('.detail__bar').getAnimations().length,overflow:document.documentElement.scrollWidth>innerWidth})`));
  check(`${width}px 详情切换播放动画且返回条保持静止`,motion.active>0&&motion.opacity>0&&motion.opacity<1&&motion.sticky===0&&!motion.overflow);
  await ev(`location.hash='#/film/${db.movies[1].id}'`); await sleep(40);
  await ev(`location.hash='#wall'`); await sleep(300);
  const settled=JSON.parse(await ev(`JSON.stringify({home:!document.querySelector('#viewHome').hidden,detail:document.querySelector('#viewDetail').hidden,animations:document.getAnimations().filter(a=>a.playState==='running' && a.effect?.target?.getClientRects().length).length,opacity:getComputedStyle(document.querySelector('#wall')).opacity})`));
  check(`${width}px 快速切换后稳定返回海报墙`,settled.home&&settled.detail&&settled.animations===0&&settled.opacity==='1');
  await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  await ev(`location.hash='#/film/${firstId}'`); await sleep(70);
  check(`${width}px 减少动态效果时直接切换`,await ev(`document.getAnimations().length===0&&!document.querySelector('#viewDetail').hidden&&getComputedStyle(document.querySelector('.detail__hero')).opacity==='1'`));
}
await send("Emulation.setEmulatedMedia",{features:[]});

/* 16:9 首屏必须包含标题、基础信息与全部评分。 */
for (const [width,height] of [[1280,720],[1440,810],[1920,1080]]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  for (const movie of db.movies) {
    await send('Page.navigate',{url:BASE+'#/film/'+movie.id}); await sleep(300);
    check(`${width}×${height}《${movie.title}》片名和评分首屏完整可见`, await ev(`(() => {
      const title=document.querySelector('.detail__title').getBoundingClientRect();
      const scores=document.querySelector('.detail__ratings').getBoundingClientRect();
      return scrollY===0 && title.top>document.querySelector('.detail__bar').getBoundingClientRect().bottom && scores.bottom<=innerHeight && document.documentElement.scrollWidth<=innerWidth;
    })()`));
  }
}

/* 详情保持中段静态排版，滚动时不发生额外位移或固定。 */
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:810,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:BASE+'#/film/inception'});await sleep(400);
const readStaticDetail=()=>ev(`(() => {const hero=document.querySelector('.detail__hero'),info=document.querySelector('.detail__hero-inner');return {scroll:scrollY,heroTop:hero.getBoundingClientRect().top,localInfo:info.getBoundingClientRect().top-hero.getBoundingClientRect().top,transform:getComputedStyle(info).transform,position:getComputedStyle(hero).position};})()`);
const staticStart=await readStaticDetail();
await ev(`window.scrollTo({top:200,behavior:'instant'})`);await sleep(120);
const staticAfter=await readStaticDetail();
check('详情滚动保持中段排版且无额外位移',Math.abs(staticAfter.localInfo-staticStart.localInfo)<2&&Math.abs(staticStart.heroTop-staticAfter.heroTop-staticAfter.scroll)<2&&staticAfter.transform==='none'&&staticAfter.position!=='sticky');

/* 自动轮播：按真实 6 秒间隔验证，不加速计时器。 */
for (const width of [1440,390]) {
  await send("Emulation.setDeviceMetricsOverride", {width,height:900,deviceScaleFactor:1,mobile:width===390});
  await send("Emulation.setEmulatedMedia", {features:[{name:"prefers-reduced-motion",value:"no-preference"}]});
  await send("Page.navigate", {url:BASE}); await sleep(400);
  check(`${width}px 不显示轮播序号或操作控件`, await ev(`!document.querySelector('.hero__controls,.hero__counter,[data-hero-action],.hero__position')`));
  await sleep(6200);
  const second= db.movies.find(m => m.id !== expectedHero.id);
  const carousel=JSON.parse(await ev(`JSON.stringify({title:document.querySelector('.hero__title').textContent,backdrop:document.querySelector('.hero__backdrop img').getAttribute('src'),summary:document.querySelector('.hero__summary').textContent,loaded:document.querySelector('.hero__backdrop img').naturalWidth>0,overflow:document.documentElement.scrollWidth>innerWidth})`));
  check(`${width}px 自动换片后标题、剧照和简介同步`,carousel.title===second.title&&carousel.backdrop===second.backdrop&&carousel.summary===second.summary&&carousel.loaded&&!carousel.overflow,carousel.title);
  if (width===1440) await ev(`document.querySelector('#hero').dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse'}))`);
  else await ev(`window.scrollTo({top:document.querySelector('#hero').getBoundingClientRect().bottom+scrollY,behavior:'instant'})`);
  await sleep(6300);
  check(`${width}px ${width===1440?'悬停':'离开首屏'}时暂停自动切换`,await ev(`document.querySelector('.hero__title').textContent===${JSON.stringify(second.title)}`));
  const secondLink = '#chartList a[href="#/film/' + second.id + '"]';
  await ev(`document.querySelector(${JSON.stringify(secondLink)}).click()`); await sleep(350);
  check(`${width}px 轮播后仍能从排行榜查看影片详情`,await ev(`document.querySelector('.detail__title').textContent===${JSON.stringify(second.title)}`));
}
await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
await send("Page.navigate",{url:BASE}); await sleep(6600);
check('减少动态效果时不自动轮播',await ev(`document.querySelector('.hero__title').textContent===${JSON.stringify(expectedHero.title)}&&document.getAnimations().length===0`));
await send("Emulation.setEmulatedMedia",{features:[]});

/* 8. 控制台干净 */
check("无 JS 异常", problems.length === 0, problems.join(" | ") || "干净");

const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} 通过 ===`);
ws.close();
chrome.kill();
process.exit(failed.length ? 1 : 0);
