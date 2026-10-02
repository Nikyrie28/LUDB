/* 回归检查：node --test tools/backend.test.mjs；仅操作临时目录与本机临时端口。 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, readdir, stat, symlink, rm } from "node:fs/promises";
import { once } from "node:events";
import { join } from "node:path";
import { ROOT, loadMovieData, validateMovieData } from "./validate-data.mjs";
import { createPreviewServer } from "./serve.mjs";
import { download, fetchOne, jpegDimensions, pick } from "./fetch-poster.mjs";

const current = await loadMovieData();
const clone = value => JSON.parse(JSON.stringify(value));
const jpeg = await readFile(join(ROOT, current.movies[0].poster));
const hit = { title: "情书", year: "1995", type: "movie", img: "https://example.invalid/view/photo/s_ratio_poster/test.jpg" };
const target = { q: "情书", title: "情书", year: "1995", alts: [] };
const imageResponse = () => new Response(jpeg, { headers: { "Content-Type": "image/jpeg" } });
let scratch, root, base, server, fixture;

before(async () => {
  scratch = await mkdtemp("/tmp/ludb-backend-test-");
  root = join(scratch, "site");
  await mkdir(join(root, "assets/posters"), { recursive: true });
  await mkdir(join(root, "assets/css"), { recursive: true });
  await mkdir(join(root, "assets/js"), { recursive: true });
  fixture = { meta: clone(current.meta), movies: [clone(current.movies[0])] };
  await writeFile(join(root, "data.js"), "window.LMDB=" + JSON.stringify(fixture));
  await writeFile(join(root, "index.html"), "<!doctype html><title>LUDB</title>");
  await writeFile(join(root, "assets/css/lmdb.css"), "body{}");
  await writeFile(join(root, "assets/js/lmdb.js"), "void 0;");
  await writeFile(join(root, "assets/favicon.svg"), "<svg/>");
  await writeFile(join(root, "assets/logo.png"), await readFile(join(ROOT, "assets/logo.png")));
  await writeFile(join(root, "assets/logo-display.png"), await readFile(join(ROOT, "assets/logo-display.png")));
  await writeFile(join(root, fixture.movies[0].poster), jpeg);
  if (fixture.movies[0].posterPreview) await writeFile(join(root, fixture.movies[0].posterPreview), jpeg);
  if (fixture.movies[0].posterThumb) await writeFile(join(root, fixture.movies[0].posterThumb), jpeg);
  await writeFile(join(root, "AGENTS.md"), "private maintenance document");
  await writeFile(join(scratch, "outside.txt"), "outside fixture");
  server = createPreviewServer({ root, onError: () => {} });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

test("当前影片数据和全部海报通过校验", () => {
  assert.equal(new Set(current.movies.map(m => m.id)).size, current.movies.length);
});
for (const [name, mutate, error] of [
  ["重复 ID", db => db.movies.push(clone(db.movies[0])), /id 重复/],
  ["越界评分", db => { db.movies[0].myScore = 10.1; }, /myScore/],
  ["NaN 评分", db => { db.movies[0].myScore = NaN; }, /myScore/],
  ["IMDb 越界", db => { db.movies[0].imdbScore = 11; }, /imdbScore/],
  ["豆瓣非数值", db => { db.movies[0].doubanScore = "8.8"; }, /doubanScore/],
  ["评分来源非法协议", db => { db.movies[0].imdbUrl = "javascript:alert(1)"; }, /imdbUrl/],
  ["非法日期", db => { db.movies[0].markedAt = "2026-02-30"; }, /markedAt/],
  ["缺少评分状态", db => { delete db.movies[0].scoreStatus; }, /scoreStatus/],
  ["越界海报路径", db => { db.movies[0].poster = "../outside.jpg"; }, /poster/],
  ["缺少片名", db => { db.movies[0].title = ""; }, /title/],
]) {
  test("校验拒绝" + name, () => {
    const db = clone(current); mutate(db); assert.throws(() => validateMovieData(db), error);
  });
}
test("未评分接受 null，真实评分接受 0", () => {
  const db = clone(current);
  db.movies[0].scoreStatus = "unrated"; db.movies[0].myScore = null;
  validateMovieData(db);
  db.movies[0].scoreStatus = "rated"; db.movies[0].myScore = 0;
  validateMovieData(db);
});
test("缺失海报与错误 JS 语法有明确错误", async () => {
  const db = clone(fixture); db.movies[0].poster = "assets/posters/missing.jpg";
  await assert.rejects(loadMovieData(root, "window.LMDB=" + JSON.stringify(db)), /海报文件不存在/);
  await assert.rejects(loadMovieData(root, "window.LMDB={"), /解析失败/);
});

test("展示文件仍正常访问，服务监听本机地址", async () => {
  assert.equal(server.address().address, "127.0.0.1");
  for (const path of ["/", "/index.html", "/data.js", "/assets/css/lmdb.css", "/assets/js/lmdb.js", "/assets/favicon.svg", "/assets/logo.png", "/" + fixture.movies[0].poster]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    await response.arrayBuffer();
  }
});
test("维护文件、隐藏目录、归档及越界路径被阻止", async () => {
  for (const path of ["/AGENTS.md", "/README.md", "/tools/serve.mjs", "/.codex/config.toml", "/assets/posters/_placeholder-svg/a.svg", "/assets/posters/%2e%2e%2f%2e%2e%2fAGENTS.md", "/assets/posters/%00.jpg"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path); await response.arrayBuffer();
  }
});
test("素材符号链接不能读取维护文件或项目外文件", async () => {
  await symlink(join(root, "AGENTS.md"), join(root, "assets/posters/private.jpg"));
  await symlink(join(scratch, "outside.txt"), join(root, "assets/posters/outside.jpg"));
  for (const name of ["private", "outside"]) {
    const response = await fetch(base + "/assets/posters/" + name + ".jpg");
    assert.equal(response.status, 404); await response.arrayBuffer();
  }
});
test("HEAD 无响应体，非法方法与非法编码被拒绝", async () => {
  const head = await fetch(base + "/", { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(await head.text(), "");
  assert.ok(Number(head.headers.get("content-length")) > 0);
  const post = await fetch(base + "/data.js", { method: "POST" });
  assert.equal(post.status, 405); assert.equal(post.headers.get("allow"), "GET, HEAD"); await post.text();
  const malformed = await fetch(base + "/%E0%A4%A");
  assert.equal(malformed.status, 400); await malformed.text();
});
test("服务运行中也拒绝无效数据，修复后恢复响应", async () => {
  try {
    const invalid = clone(fixture); invalid.movies[0].myScore = 11;
    await writeFile(join(root, "data.js"), "window.LMDB=" + JSON.stringify(invalid));
    const response = await fetch(base + "/data.js");
    assert.equal(response.status, 500); assert.equal(await response.text(), "500");
  } finally { await writeFile(join(root, "data.js"), "window.LMDB=" + JSON.stringify(fixture)); }
  const response = await fetch(base + "/data.js"); assert.equal(response.status, 200); await response.text();
});

test("候选必须同时匹配片名、年份与影片类型", () => {
  assert.equal(pick([{ ...hit, title: "另一部影片" }], target), null);
  assert.equal(pick([{ ...hit, year: "2004" }], target), null);
  assert.equal(pick([{ ...hit, type: "book" }], target), null);
  assert.deepEqual(pick([hit], target), hit);
});
test("错片不会请求或保存海报", async () => {
  let requests = 0;
  const file = join(scratch, "mismatch.jpg");
  await assert.rejects(fetchOne(target, file, () => {}, {
    attempts: 1, wait: async () => {}, fetchImpl: async url => {
      requests++; assert.match(String(url), /subject_suggest/);
      return new Response(JSON.stringify([{ ...hit, year: "2004" }]));
    },
  }), /未找到片名、年份均匹配/);
  assert.equal(requests, 1); await assert.rejects(stat(file), { code: "ENOENT" });
});
test("兜底词精确命中后可以保存已校验 JPEG", async () => {
  const file = join(scratch, "fallback.jpg");
  const result = await fetchOne({ ...target, alts: ["岩井俊二"] }, file, () => {}, {
    attempts: 1, wait: async () => {}, fetchImpl: async url => {
      if (!String(url).includes("subject_suggest")) return imageResponse();
      const q = new URL(url).searchParams.get("q");
      return new Response(JSON.stringify(q === "岩井俊二" ? [hit] : [{ ...hit, title: "错片" }]));
    },
  });
  assert.equal(result.matched, true); assert.deepEqual(await readFile(file), jpeg);
  assert.ok(jpegDimensions(await readFile(file)).width > 0);
});
test("已有文件在搜索前被保护，不发起网络请求", async () => {
  const file = join(scratch, "original.jpg"); const original = Buffer.from("original");
  await writeFile(file, original);
  await assert.rejects(fetchOne(target, file, () => {}, { fetchImpl: async () => { throw Error("不应请求网络"); } }), /输出文件已存在/);
  assert.deepEqual(await readFile(file), original);
});
test("大 HTML 错误页和截断图片不会写入目标", async () => {
  for (const [name, response] of [
    ["html", new Response("x".repeat(6000), { headers: { "Content-Type": "text/html" } })],
    ["fake", new Response("x".repeat(6000), { headers: { "Content-Type": "image/jpeg" } })],
    ["truncated", new Response(jpeg.subarray(0, jpeg.length - 2), { headers: { "Content-Type": "image/jpeg" } })],
  ]) {
    const file = join(scratch, name + ".jpg");
    await assert.rejects(download("https://example.invalid/image.jpg", file, async () => response), /JPEG/);
    await assert.rejects(stat(file), { code: "ENOENT" });
  }
});
test("目标在下载期间出现时也不覆盖，临时文件被清理", async () => {
  const file = join(scratch, "race.jpg"); const concurrent = Buffer.from("concurrent file");
  await assert.rejects(download("https://example.invalid/image.jpg", file, async () => {
    await writeFile(file, concurrent); return imageResponse();
  }), /输出文件已存在/);
  assert.deepEqual(await readFile(file), concurrent);
  assert.equal((await readdir(scratch)).filter(name => name.endsWith(".tmp")).length, 0);
});
