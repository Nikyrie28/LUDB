/* =========================================================================
   LUDB · 应用逻辑 v2
   -------------------------------------------------------------------------
   数据来自 data.js（window.LMDB）。本文件只负责渲染与交互，不用改。

   路由：
     #/            首页
     #chart #wall #about   首页内的锚点
     #/film/<id>   影片详情（全屏二级页面）
   ========================================================================= */
(function () {
  "use strict";

  var DB = window.LMDB || { meta: {}, movies: [] };
  var MOVIES = (DB.movies || []).slice();
  var META = DB.meta || {};

  /* ── 工具 ─────────────────────────────────────────────────────────── */

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  var posterAttrs = function (m, sizes) {
    if (!m.posterPreview) return '';
    var sources = (m.posterThumb ? esc(m.posterThumb) + ' 256w, ' : '') + esc(m.posterPreview) + ' 512w';
    return ' srcset="' + sources + '" sizes="' + (sizes || '(max-width: 700px) 180px, 200px') + '"';
  };

  var pad2 = function (n) { return n < 10 ? "0" + n : String(n); };

  /** "2026-09-19" → "26.09.19" */
  var shortDate = function (iso) {
    if (!iso) return "未记录";
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    return p[0].slice(2) + "." + p[1] + "." + p[2];
  };

  /** "2026-09-19" → "2026 年 9 月 19 日" */
  var longDate = function (iso) {
    if (!iso) return "未记录";
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    return p[0] + " 年 " + Number(p[1]) + " 月 " + Number(p[2]) + " 日";
  };

  var runtimeText = function (min) {
    if (!min) return "未记录";
    var h = Math.floor(min / 60);
    var m = min % 60;
    return h > 0 ? h + " 小时 " + pad2(m) + " 分" : m + " 分钟";
  };

  var isRated = function (m) { return m.scoreStatus === "rated" && Number.isFinite(m.myScore); };
  var scoreText = function (m) { return isRated(m) ? Number(m.myScore).toFixed(1) : "待评"; };

  /** 英文名 / 原名去重拼接 */
  var subtitleOf = function (m) {
    var seen = {};
    return [m.enTitle, m.originalTitle].filter(function (t) {
      if (!t || seen[t]) return false;
      seen[t] = true;
      return true;
    }).join(" · ");
  };

  var externalText = function (score) { return Number.isFinite(score) ? score.toFixed(1) : "暂无"; };
  function externalSorter(field) {
    return function (a, b) {
      var av = Number.isFinite(a[field]) ? a[field] : -1;
      var bv = Number.isFinite(b[field]) ? b[field] : -1;
      return bv - av || b.year - a.year || a.id.localeCompare(b.id);
    };
  }
  function externalRatings(m, links) {
    return '<span class="external-ratings">' + [
      ['IMDb', m.imdbScore, m.imdbUrl, 'imdb'], ['豆瓣', m.doubanScore, m.doubanUrl, 'douban']
    ].map(function (r) {
      var inner = '<span>' + r[0] + '</span> <b>' + externalText(r[1]) + '</b>';
      return links ? '<a data-rating="' + r[3] + '" href="' + esc(r[2]) + '" target="_blank" rel="noopener noreferrer" aria-label="查看' + r[0] + '评分来源">' + inner + '</a>' : '<span data-rating="' + r[3] + '">' + inner + '</span>';
    }).join('') + '</span>';
  }

  var sorters = {
    imdb: externalSorter('imdbScore'),
    douban: externalSorter('doubanScore'),
    score: function (a, b) {
      var ar = isRated(a), br = isRated(b);
      if (ar !== br) return ar ? -1 : 1;
      return (ar ? b.myScore - a.myScore : 0) || b.year - a.year;
    },
    year: function (a, b) { return b.year - a.year || sorters.score(a, b); },
  };

  /** 真实评分参与排名；待评影片保留在收藏与翻片顺序中。 */
  var byScore = MOVIES.slice().sort(sorters.score);
  var ratedMovies = byScore.filter(isRated);
  var rankOf = Object.create(null);
  ratedMovies.forEach(function (m, i) { rankOf[m.id] = i + 1; });

  var findMovie = function (id) {
    return MOVIES.filter(function (x) { return x.id === id; })[0];
  };

  /** 搜索关键字高亮 */
  function highlight(text, q) {
    var safe = esc(text);
    if (!q) return safe;
    var re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return safe.replace(re, "<mark>$1</mark>");
  }

  function matches(m, q) {
    if (!q) return true;
    var hay = [m.title, m.enTitle, m.originalTitle, m.director, m.country]
      .concat(m.genres || []).concat(m.cast || []).join(" ").toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  var $ = function (sel) { return document.querySelector(sel); };

  /* ── 状态 ─────────────────────────────────────────────────────────── */

  var state = {
    sort: "imdb",
    wallSort: "imdb",
    genre: "全部",
    query: "",
    route: { name: "home", id: null },
    /** 从首页进详情前的滚动位置，返回时恢复（技能规则 state-preservation） */
    homeScroll: 0,
    /** 进入详情的来源板块（chart / wall），用于面包屑、返回文案与导航高亮 */
    detailSource: "chart",
  };

  var SOURCE_LABEL = { chart: "排行榜", wall: "海报墙", hero: "排行榜" };

  function backdropHTML(m, className) {
    if (!m.backdrop) return '';
    return '<div class="' + className + '" aria-hidden="true" style="--backdrop-position:' + esc(m.backdropPosition || '50% 50%') + ';--backdrop-position-mobile:' + esc(m.backdropPositionMobile || m.backdropPosition || '50% 50%') + '">' +
      '<img data-backdrop src="' + esc(m.backdrop) + '" alt="" width="1920" height="1080" fetchpriority="high" decoding="async"></div>';
  }

  function watchBackdrop(host) {
    var image = host.querySelector('[data-backdrop]');
    if (!image) return;
    var hideBackdrop = function () {
      image.closest('section').classList.remove('has-backdrop');
      image.parentElement.hidden = true;
    };
    image.addEventListener('error', hideBackdrop, { once: true });
    if (image.complete && !image.naturalWidth) hideBackdrop();
  }

  /* ── 首屏精选 ─────────────────────────────────────────────────────── */

  var firstHero = ratedMovies[0] || MOVIES[0];
  var heroMovies = firstHero ? [firstHero].concat(MOVIES.filter(function (m) { return m.id !== firstHero.id; })) : [];
  var heroIndex = 0, heroTimer = null, heroRequest = 0;
  var heroPaused = false, heroHovered = false, heroFocused = false, heroVisible = false;

  function syncHeroTimer() {
    window.clearTimeout(heroTimer);
    ++heroRequest; // Cancel a pending image decode when focus, visibility or route changes.
    var host = $('#hero');
    if (!host) return;
    var toggle = host.querySelector('[data-hero-action="pause"]');
    if (toggle) {
      toggle.textContent = heroPaused ? '播放' : '暂停';
      toggle.setAttribute('aria-label', heroPaused ? '播放自动轮播' : '暂停自动轮播');
      toggle.hidden = motionPreference.matches;
    }
    var running = heroMovies.length > 1 && !heroPaused && !heroHovered && !heroFocused && !host.contains(document.activeElement) && heroVisible && !document.hidden && state.route.name === 'home' && !motionPreference.matches;
    var slide = host.querySelector('.hero__slide');
    if (slide) slide.setAttribute('aria-live', running ? 'off' : 'polite');
    if (running) heroTimer = window.setTimeout(function () { changeHero(1); }, 6000);
  }

  function changeHero(step) {
    if (heroMovies.length < 2) return;
    window.clearTimeout(heroTimer);
    var index = (heroIndex + step + heroMovies.length) % heroMovies.length;
    var request = ++heroRequest;
    var ready = Promise.resolve();
    if (heroMovies[index].backdrop) {
      var image = new Image();
      image.src = heroMovies[index].backdrop;
      // Keep the current slide visible until the next still is decoded.
      ready = image.decode().catch(function () {});
    }
    ready.then(function () {
      if (request !== heroRequest) return;
      if ($('#hero').contains(document.activeElement)) { syncHeroTimer(); return; }
      heroIndex = index;
      renderHero();
      syncHeroTimer();
    });
  }

  function initHeroCarousel() {
    var host = $('#hero');
    host.addEventListener('click', function (e) {
      if (!e.target.closest('[data-hero-action="pause"]')) return;
      heroPaused = !heroPaused;
      syncHeroTimer();
    });
    host.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { heroHovered = true; syncHeroTimer(); } });
    host.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { heroHovered = false; syncHeroTimer(); } });
    host.addEventListener('focusin', function () { heroFocused = true; syncHeroTimer(); });
    host.addEventListener('focusout', function (e) { heroFocused = host.contains(e.relatedTarget); syncHeroTimer(); });
    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting && entries[0].intersectionRatio >= .3;
      syncHeroTimer();
    }, { threshold:[0,.3] }).observe(host);
    document.addEventListener('visibilitychange', syncHeroTimer);
    motionPreference.addEventListener('change', syncHeroTimer);
  }

  function renderHero() {
    var host = $("#hero");
    if (!host || !byScore.length) return;
    var m = heroMovies[heroIndex];
    var rated = isRated(m);
    host.setAttribute("aria-label", "收藏影片轮播");
    host.setAttribute('aria-roledescription', '轮播');
    if (!host.querySelector('.hero__slide')) {
      host.innerHTML = '<div class="hero__slide" aria-atomic="true"></div>' +
        (heroMovies.length > 1 ? '<div class="hero__controls">' +
          '<button type="button" data-hero-action="pause" aria-label="暂停自动轮播">暂停</button></div>' : '');
    }
    var slide = host.querySelector('.hero__slide');
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', '幻灯片');
    slide.setAttribute('aria-label', (heroIndex + 1) + ' / ' + heroMovies.length + '：' + m.title);
    host.classList.toggle("has-backdrop", Boolean(m.backdrop));
    slide.innerHTML =
      backdropHTML(m, 'hero__backdrop') +
      '<div class="hero__inner">' +
        '<div class="hero__text">' +
          '<div class="hero__heading">' +
            '<p class="hero__eyebrow">' + (rated ? '我的第 ' + rankOf[m.id] + ' 名' : '影片收藏') + '</p>' +
            '<h1 class="hero__title">' + esc(m.title) + '</h1>' +
            '<p class="hero__title-en">' + esc(subtitleOf(m)) + '</p>' +
          '</div>' +
          '<div class="hero__description">' +
            '<p class="hero__meta">' + esc(m.year) + ' / ' + esc(m.director) + ' / ' + runtimeText(m.runtime) + '</p>' +
            '<p class="hero__summary">' + esc(m.tagline || m.summary) + '</p>' +
          '</div>' +
          '<div class="hero__cta">' +
            '<a class="btn btn--accent" href="#/film/' + esc(m.id) + '">查看详情<span aria-hidden="true">↗</span></a>' +
            '<a class="hero__collection-link" href="#wall">浏览海报墙<span aria-hidden="true">↗</span></a>' +
          '</div>' +
        '</div>' +
        '<div class="hero__scores">' + externalRatings(m, false) +
          '<span class="hero__personal"><span>个人评分</span><b>' + scoreText(m) + '</b></span>' +
        '</div>' +
      '</div>';
    watchBackdrop(host);
    slide.classList.remove('hero__slide--enter');
    void slide.offsetWidth;
    if (!motionPreference.matches) slide.classList.add('hero__slide--enter');
  }

  /* ── 排行榜 ───────────────────────────────────────────────────────── */

  function renderChart() {
    var host = $("#chartList");
    var list = MOVIES.slice().sort(sorters[state.sort]);
    host.dataset.sort = state.sort;

    host.innerHTML = list.map(function (m) {
      var rank = rankOf[m.id];
      return '' +
        '<li class="chart__row' + (rank === 1 ? " is-top" : "") + '">' +
          '<a class="chart__link" href="#/film/' + esc(m.id) + '" aria-label="查看《' + esc(m.title) + '》详情"></a>' +
          '<span class="chart__rank">' + (rank || '') + '</span>' +
          '<span class="chart__thumb"><img src="' + esc(m.poster) + '"' + posterAttrs(m, "46px") + ' alt="" width="1080" height="1620" loading="lazy" decoding="async"></span>' +
          '<span class="chart__main">' +
            '<span class="chart__title">' + esc(m.title) + '</span>' +
            '<span class="chart__sub">' + esc(m.year) +
              '<span class="sep" aria-hidden="true">/</span>' + esc(m.director) +
              '<span class="chart__country"><span class="sep" aria-hidden="true">/</span>' + esc(m.country) + '</span>' +
            '</span>' +
          '</span>' +
          '<span class="chart__genres">' +
            (m.genres || []).map(function (g) { return '<span class="chart__genre">' + esc(g) + '</span>'; }).join("") +
          '</span>' +
          '<span class="chart__date">' + shortDate(m.markedAt) + '</span>' +
          '<span class="chart__ratings">' + externalRatings(m, false) + '<span class="score"><span class="score__label">个人评分</span><span class="score__badge' + (isRated(m) ? '' : ' is-pending') + '">' + scoreText(m) + '</span></span></span>' +
        '</li>';
    }).join("");
  }

  /* ── 海报墙 ───────────────────────────────────────────────────────── */

  function renderChips() {
    var host = $("#genreChips");
    var counts = {};
    MOVIES.forEach(function (m) {
      (m.genres || []).forEach(function (g) { counts[g] = (counts[g] || 0) + 1; });
    });

    var genres = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || a.localeCompare(b, "zh");
    });

    var items = [{ name: "全部", count: MOVIES.length }].concat(
      genres.map(function (g) { return { name: g, count: counts[g] }; })
    );

    host.innerHTML = items.map(function (it) {
      var active = state.genre === it.name;
      return '<button class="chip' + (active ? " is-active" : "") + '" type="button" data-genre="' + esc(it.name) + '"' +
        (active ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' +
        esc(it.name) + '<span class="chip__count">' + it.count + '</span></button>';
    }).join("");
  }

  function visibleMovies() {
    var q = state.query.trim().toLowerCase();
    return MOVIES.filter(function (m) {
      if (state.genre !== "全部" && (m.genres || []).indexOf(state.genre) === -1) return false;
      return matches(m, q);
    }).sort(sorters[state.wallSort]);
  }

  function renderWall() {
    var host = $("#wallGrid");
    var empty = $("#wallEmpty");
    var list = visibleMovies();
    var q = state.query.trim();

    if (!list.length) {
      host.innerHTML = "";
      empty.hidden = false;
    } else {
      empty.hidden = true;
      host.innerHTML = list.map(function (m) {
        return '' +
          '<article class="card">' +
            '<a class="card__link" href="#/film/' + esc(m.id) + '" aria-label="查看《' + esc(m.title) + '》详情"></a>' +
            '<div class="card__poster">' +
              '<img src="' + esc(m.poster) + '"' + posterAttrs(m) + ' alt="' + esc(m.title) + ' 海报" width="1080" height="1620" loading="lazy" decoding="async">' +
            '</div>' +
            '<div class="card__body">' +
              '<h3 class="card__title">' + highlight(m.title, q) + '</h3>' +
              externalRatings(m, false) +
              '<p class="card__meta">' + esc(m.year) + ' · ' + highlight(m.director, q) + '</p>' +
              '<div class="card__personal">' +
                (rankOf[m.id] ? '<span class="card__rank">我的第 ' + rankOf[m.id] + ' 名</span>' : '') +
                '<span class="card__score' + (isRated(m) ? '' : ' is-pending') + '">个人评分 ' + scoreText(m) + '</span>' +
              '</div>' +
            '</div>' +
          '</article>';
      }).join("");
    }

    $("#wallCount").textContent = state.query.trim()
      ? "匹配 " + list.length + " 部 · 关键词「" + state.query.trim() + "」"
      : "共 " + list.length + " 部" + (state.genre === "全部" ? "" : " · 类型「" + state.genre + "」");
  }

  /* ── 详情页（全屏二级页面） ───────────────────────────────────────── */

  function detailHTML(m) {
    var idx = byScore.indexOf(m);
    var prev = byScore[idx - 1];
    var next = byScore[idx + 1];
    var rank = rankOf[m.id];
    var rated = isRated(m);
    var fromLabel = SOURCE_LABEL[state.detailSource] || "排行榜";
    var backIcon = '<span aria-hidden="true">←</span>';

    var facts = [
      ["年份", m.year, true],
      ["导演", m.director, false],
      ["主演", (m.cast || []).join(" / "), false],
      ["国家", m.country, false],
      ["片长", runtimeText(m.runtime), true],
      ["标记时间", longDate(m.markedAt), true],
    ];

    var reviewBlock = m.review
      ? '<p class="detail__text">' + esc(m.review) + '</p>'
      : '<p class="detail__empty-note">还没有写下这部电影的短评。</p>';

    return '' +
      /* 返回条：sticky，任意滚动位置都能返回 */
      '<div class="detail__bar">' +
        '<div class="detail__bar-inner">' +
          '<a class="detail__back" href="#" data-back>' +
            backIcon +
            '返回' + fromLabel +
          '</a>' +
          '<nav class="detail__crumbs" aria-label="面包屑">' +
            '<a href="#">LUDB</a>' +
            '<span class="sep" aria-hidden="true">/</span>' +
            '<a href="#' + esc(state.detailSource === "wall" ? "wall" : "chart") + '">' + fromLabel + '</a>' +
            '<span class="sep" aria-hidden="true">/</span>' +
            '<span class="now" aria-current="page">' + esc(m.title) + '</span>' +
          '</nav>' +
          '<span class="detail__bar-pos">' + (rank ? '我的第 ' + rank + ' / ' + ratedMovies.length + ' 名' : '未参与排名') + '</span>' +
        '</div>' +
      '</div>' +

      /* 主视觉 */
      '<div class="detail__stage">' +
      '<section class="detail__hero' + (m.backdrop ? ' has-backdrop' : '') + '">' +
        backdropHTML(m, 'detail__backdrop') +
        '<div class="detail__hero-inner">' +
          '<figure class="detail__poster">' +
            '<img src="' + esc(m.poster) + '"' + posterAttrs(m, "(max-width: 700px) 96px, 244px") + ' alt="' + esc(m.title) + ' 海报" width="1080" height="1620">' +
          '</figure>' +
          '<div class="detail__intro">' +
            (rank ? '<p class="detail__eyebrow">我的第 ' + rank + ' 名</p>' : '') +
            '<h1 class="detail__title">' + esc(m.title) + '</h1>' +
            '<p class="detail__title-en">' + esc(subtitleOf(m)) + '</p>' +
            '<div class="detail__meta">' +
              '<span>' + esc(m.year) + ' 年</span>' +
              '<span class="sep" aria-hidden="true">/</span>' +
              '<span>' + esc(m.country) + '</span>' +
              '<span class="sep" aria-hidden="true">/</span>' +
              '<span>' + runtimeText(m.runtime) + '</span>' +
            '</div>' +
            '<div class="detail__meta-tags">' +
              (m.genres || []).map(function (g) { return '<span class="tag">' + esc(g) + '</span>'; }).join("") +
            '</div>' +
            '<div class="detail__ratings">' + externalRatings(m, true) +
            '<div class="detail__scoreline">' +
              '<span class="detail__score' + (rated ? '' : ' is-pending') + '">' +
                '<span class="detail__score-label">个人评分</span><span class="detail__score-num">' + scoreText(m) + '</span>' +
                '' +
              '</span>' +
              '<span class="detail__score-note u-visually-hidden">' + (rated ? '个人评分，满分 10 分' : '个人评分：尚未评分') + (m.markedAt ? '，标记于 ' + shortDate(m.markedAt) : '') + '</span>' +
            '</div></div>' +
            '<details class="rating-provenance"><summary>评分来源与说明</summary><p>' + esc(META.ratingsNote) + ' 录入：' + esc(META.ratingsRecordedAt) + '</p></details>' +
            (m.doubanNote ? '<p class="ratings-note">' + esc(m.doubanNote) + '</p>' : '') +
          '</div>' +
        '</div>' +
      '</section></div>' +

      /* 正文 + 侧栏 */
      '<div class="detail__content">' +
        '<div class="detail__main">' +
          '<section class="detail__section">' +
            '<p class="detail__section-label">剧情</p>' +
            '<p class="detail__text">' + esc(m.summary) + '</p>' +
          '</section>' +

          '<section class="detail__section">' +
            '<p class="detail__section-label">我的短评</p>' +
            reviewBlock +
          '</section>' +

          '<section class="detail__section">' +
            '<p class="detail__section-label">类型</p>' +
            '<div class="detail__tags">' +
              (m.genres || []).map(function (g) {
                return '<a class="chip" href="#wall" data-jump-genre="' + esc(g) + '">' + esc(g) + '</a>';
              }).join("") +
            '</div>' +
          '</section>' +
        '</div>' +

        '<aside class="detail__aside" aria-label="影片信息">' +
          '<dl class="detail__facts">' +
            facts.map(function (f) {
              return '<div class="detail__fact"><dt>' + esc(f[0]) + '</dt>' +
                '<dd' + (f[2] ? ' class="is-num"' : '') + '>' + esc(f[1]) + '</dd></div>';
            }).join("") +
          '</dl>' +
          '<nav class="detail__pager" aria-label="在收藏中切换影片">' +
            (prev
              ? '<a class="detail__pager-btn" href="#/film/' + esc(prev.id) + '" rel="prev">' +
                  '<span class="detail__pager-label">上一部</span>' +
                  '<span class="detail__pager-title">' + esc(prev.title) + '</span></a>'
              : '<button class="detail__pager-btn" type="button" disabled>' +
                  '<span class="detail__pager-label">上一部</span>' +
                  '<span class="detail__pager-title">已经是第一部</span></button>') +
            (next
              ? '<a class="detail__pager-btn" href="#/film/' + esc(next.id) + '" rel="next">' +
                  '<span class="detail__pager-label">下一部</span>' +
                  '<span class="detail__pager-title">' + esc(next.title) + '</span></a>'
              : '<button class="detail__pager-btn" type="button" disabled>' +
                  '<span class="detail__pager-label">下一部</span>' +
                  '<span class="detail__pager-title">已经是最后一部</span></button>') +
          '</nav>' +
        '</aside>' +
      '</div>' +

      '<div class="detail__foot">' +
        '<a class="btn btn--ghost" href="#" data-back>' +
          backIcon +
          '返回' + fromLabel +
        '</a>' +
      '</div>';
  }

  /* ── 路由 ─────────────────────────────────────────────────────────── */

  var viewHome = $("#viewHome");
  var viewDetail = $("#viewDetail");
  var motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  var animatedRegions = [];

  // Animate content regions rather than their sticky-navigation ancestor.
  // Repeated navigation cancels the previous entrance; no delayed route writes.
  function enterRegions(regions, direction) {
    animatedRegions.forEach(function (region) {
      region.classList.remove("route-enter", "route-return", "route-next", "route-prev");
    });
    animatedRegions = [];
    if (motionPreference.matches) return;
    regions.filter(Boolean).forEach(function (region) {
      void region.offsetWidth;
      region.classList.add("route-enter");
      if (direction) region.classList.add("route-" + direction);
      animatedRegions.push(region);
    });
  }

  /** 解析 location.hash → 路由对象 */
  function parseHash() {
    var h = location.hash || "";
    var m = h.match(/^#\/film\/(.+)$/);
    if (m) return { name: "detail", id: decodeURIComponent(m[1]) };
    return { name: "home", anchor: h.replace(/^#\/?/, "") || "" };
  }

  function showHome(opts) {
    opts = opts || {};
    var wasDetail = state.route.name === "detail";

    state.route = { name: "home", id: null };
    viewDetail.hidden = true;
    viewDetail.classList.remove("is-active", "is-entering");
    viewDetail.innerHTML = "";
    viewHome.hidden = false;
    viewHome.classList.add("is-active");

    // 恢复进入详情前的滚动位置（技能规则 state-preservation）
    // 用 html 内联样式临时关掉 smooth，否则全局 scroll-behavior 会强制播放滚动动画
    if (wasDetail && !opts.anchor) {
      scrollInstantly(state.homeScroll);
    } else if (opts.anchor) {
      var target = document.getElementById(opts.anchor);
      if (target) {
        var top = target.getBoundingClientRect().top + window.pageYOffset -
                  (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--appbar-h"), 10) || 68);
        scrollInstantly(top);
      }
    }
    syncNavHighlight();
    syncHeroTimer();
    var destination = opts.anchor && document.getElementById(opts.anchor);
    enterRegions(destination ? [destination] : wasDetail ? Array.from(viewHome.children) : [], wasDetail ? "return" : "");
  }

  /** 跳过 smooth 的即时滚动 */
  function scrollInstantly(top) {
    var html = document.documentElement;
    html.style.scrollBehavior = "auto";
    window.scrollTo(0, top);
    // 强制读一次布局，确保样式回滚前位置已生效
    void html.offsetHeight;
    html.style.scrollBehavior = "";
  }

  function showDetail(id, opts) {
    var m = findMovie(id);
    if (!m) { showHome({ anchor: "" }); return; }
    opts = opts || {};
    var previousId = state.route.name === "detail" ? state.route.id : null;

    // 记录首页滚动位置，返回时恢复
    if (state.route.name !== "detail") {
      state.homeScroll = window.pageYOffset || document.documentElement.scrollTop || 0;
    }

    viewHome.classList.remove("is-active");
    viewHome.hidden = true;

    viewDetail.innerHTML = detailHTML(m);
    watchBackdrop(viewDetail);
    viewDetail.hidden = false;
    viewDetail.classList.add("is-active");
    measureAppBar();

    scrollInstantly(0);

    document.title = m.title + "（" + m.year + "） · LUDB";

    // 焦点移到主内容，方便屏幕阅读器与键盘用户（技能规则 focus-on-route-change）
    var heading = viewDetail.querySelector(".detail__title");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    state.route = { name: "detail", id: id };
    syncNavHighlight();
    syncHeroTimer();
    var direction = previousId
      ? (byScore.indexOf(m) < byScore.indexOf(findMovie(previousId)) ? "prev" : "next")
      : "";
    enterRegions(Array.from(viewDetail.children).filter(function (region) {
      return !region.classList.contains("detail__bar");
    }).map(function (region) {
      return region.classList.contains("detail__stage") ? region.querySelector('.detail__hero') : region;
    }), direction);
  }

  /** 顶栏导航高亮：详情页时只高亮进入的来源板块（技能规则 nav-state-active） */
  function syncNavHighlight() {
    var isDetail = state.route.name === "detail";
    var current = isDetail ? state.detailSource : null;
    [].forEach.call(document.querySelectorAll("[data-navlink]"), function (a) {
      var on = current !== null && a.dataset.navlink === current;
      a.classList.toggle("is-current", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function route() {
    var r = parseHash();
    if (r.name === "detail") showDetail(r.id);
    else showHome({ anchor: r.anchor });
  }

  /* ── 事件 ─────────────────────────────────────────────────────────── */

  function setGenre(g) {
    state.genre = g;
    renderChips();
    renderWall();
  }

  // 排序
  $("#chartSort").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-sort]");
    if (!btn) return;
    state.sort = btn.dataset.sort;
    [].forEach.call(this.querySelectorAll(".segmented__btn"), function (b) {
      var on = b === btn;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    renderChart();
  });

  $("#wallSort").addEventListener("change", function () {
    state.wallSort = this.value;
    renderWall();
  });

  // 类型筛选 chip
  $("#genreChips").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-genre]");
    if (!btn) return;
    setGenre(btn.dataset.genre);
  });

  // 搜索
  var searchInput = $("#searchInput");
  var searchTimer = null;
  searchInput.addEventListener("input", function () {
    var v = this.value;
    $("#searchClear").hidden = v.length === 0;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(function () {
      state.query = v;
      renderWall();
    }, 140);
  });
  $("#searchClear").addEventListener("click", function () {
    searchInput.value = "";
    this.hidden = true;
    state.query = "";
    renderWall();
    searchInput.focus();
  });
  // 在详情页搜索时先回到首页，否则看不到结果
  searchInput.addEventListener("focus", function () {
    if (state.route.name === "detail") location.hash = "#wall";
  });

  // 详情页里的类型链接：先回首页再筛选
  document.addEventListener("click", function (e) {
    var g = e.target.closest("[data-jump-genre]");
    if (g) {
      e.preventDefault();
      setGenre(g.dataset.jumpGenre);
      location.hash = "#wall";
      return;
    }
    // 记录进入详情的来源板块，让返回文案、面包屑与导航高亮保持一致
    var link = e.target.closest(".chart__link, .card__link, .hero__cta a[href^='#/film/']");
    if (link) {
      state.detailSource = link.classList.contains("card__link") ? "wall" : "chart";
    }
    // 返回按钮（使用 history.back 保证浏览器后退行为一致）
    if (e.target.closest("[data-back]")) {
      e.preventDefault();
      if (history.length > 1) history.back();
      else location.hash = "#" + (state.detailSource === "wall" ? "wall" : "chart");
    }
  });

  // 路由变化
  window.addEventListener("hashchange", route);

  // 键盘：详情页左右键切换上下名（技能规则 keyboard-shortcuts）
  document.addEventListener("keydown", function (e) {
    if (state.route.name !== "detail") return;

    // 输入框内的方向键留给文本编辑；target 可能是 document 本身，需先判类型
    var t = e.target;
    if (t && t.nodeType === 1) {
      var tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

    var idx = byScore.findIndex(function (m) { return m.id === state.route.id; });
    var target = e.key === "ArrowLeft" ? byScore[idx - 1] : byScore[idx + 1];
    if (target) location.hash = "#/film/" + target.id;
  });

  /* ── 初始化 ───────────────────────────────────────────────────────── */

  /** 实测顶栏高度写入 CSS 变量：移动端顶栏会换行变高，
   *  详情返回条与锚点偏移都靠它对齐，避免两条 sticky 栏重叠。 */
  function measureAppBar() {
    var bar = document.querySelector(".app-bar");
    if (!bar) return;
    var h = Math.round(bar.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--appbar-h", h + "px");
  }

  function init() {
    document.body.classList.toggle("has-personal-ranks", ratedMovies.length > 0);
    renderHero();
    initHeroCarousel();
    renderChart();
    renderChips();
    renderWall();

    $("#chartNote").textContent = MOVIES.length + " 部电影 · " + (ratedMovies.length ? ratedMovies.length + " 部已评分，名次按个人评分计算" : "个人评分尚未填写");
    $("#ratingsNote").textContent = META.ratingsNote + " 录入：" + META.ratingsRecordedAt;
    $("#aboutCount").textContent = MOVIES.length + " 部";
    $("#aboutUpdated").textContent = longDate(META.updatedAt);
    $("#footYear").textContent = new Date().getFullYear();
    document.title = "LUDB · 我看过的电影（" + MOVIES.length + " 部）";

    measureAppBar();
    route();
  }

  // 顶栏高度随断点变化（搜索框换行），窗口尺寸变化时重新测量
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(measureAppBar, 120);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
