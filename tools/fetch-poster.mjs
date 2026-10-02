#!/usr/bin/env node
/* =========================================================================
   豆瓣电影海报抓取工具
   -------------------------------------------------------------------------
   用法：
     node fetch-poster.mjs "盗梦空间" 2010                    # 打印海报 URL
     node fetch-poster.mjs "盗梦空间" 2010 -o poster.jpg       # 直接下载
     node fetch-poster.mjs "海街日记" 2015 --alt 是枝裕和 -o a.jpg
     node fetch-poster.mjs --batch targets.json -d ./posters   # 批量

   为什么需要这个工具：豆瓣的免费接口有几个反直觉的坑，重新踩一遍要好几轮。
   详见 AGENTS.md「电影海报抓取」条目。

   版权：海报版权属各发行方，仅限私人本地使用，不要公开分发。
   ========================================================================= */

import { open, mkdir, lstat, link, unlink } from "node:fs/promises";
import { basename, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const REFERER = "https://movie.douban.com/";
const SUGGEST = "https://movie.douban.com/j/subject_suggest?q=";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 参数解析 ─────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const out = { positional: [], alts: [], batch: null, out: null, dest: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o" || a === "--out") out.out = argv[++i];
    else if (a === "-d" || a === "--dest") out.dest = argv[++i];
    else if (a === "--alt") out.alts.push(argv[++i]);
    else if (a === "--batch") out.batch = argv[++i];
    else if (a === "-q" || a === "--quiet") out.quiet = true;
    else if (a === "-h" || a === "--help") out.help = true;
    else out.positional.push(a);
  }
  return out;
}

/* ── 豆瓣接口 ─────────────────────────────────────────────────────────── */

async function suggestOnce(q, fetchImpl) {
  const r = await fetchImpl(SUGGEST + encodeURIComponent(q), {
    headers: { "User-Agent": UA, Referer: REFERER },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error("suggest HTTP " + r.status);
  return r.json();
}

/** 空数组 = 被限流，不是「没有结果」。退避后重试。 */
async function suggest(q, log, { fetchImpl, wait, attempts }) {
  for (let i = 0; i < attempts; i++) {
    const list = await suggestOnce(q, fetchImpl);
    if (Array.isArray(list) && list.length) return list;
    if (i === attempts - 1) return [];
    const delay = 8000 * (i + 1);
    log(`  …「${q}」返回空数组，${delay / 1000}s 后重试 (${i + 1}/${attempts})`);
    await wait(delay);
  }
  return [];
}

/** 只接受影片类型、片名与年份均匹配的结果。 */
export function pick(list, want = {}) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.find(x => x.type === "movie" && x.title === want.title && String(x.year) === String(want.year)) || null;
}

/** s_ratio_poster(270px) → l_ratio_poster(1080px) */
function bigUrl(img) {
  return String(img).replace(
    "/view/photo/s_ratio_poster/",
    "/view/photo/l_ratio_poster/"
  );
}

async function assertNewFile(file) {
  try { await lstat(file); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  throw new Error("输出文件已存在，已保留原图；请使用新的文件名：" + file);
}

/** 检查 JPEG 标记、帧尺寸与结束标记，拒绝 HTML 错误页和截断文件。 */
export function jpegDimensions(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf.readUInt16BE(buf.length - 2) !== 0xffd9) {
    throw new Error("下载内容不是完整的 JPEG 文件");
  }
  let offset = 2;
  let size;
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 4 <= buf.length) {
    if (buf[offset++] !== 0xff) break;
    while (buf[offset] === 0xff) offset++;
    const marker = buf[offset++];
    const length = buf.readUInt16BE(offset);
    if (length < 2 || offset + length > buf.length) break;
    if (frameMarkers.has(marker) && length >= 8) size = { width: buf.readUInt16BE(offset + 5), height: buf.readUInt16BE(offset + 3) };
    if (marker === 0xda) {
      if (size?.width > 0 && size?.height > 0) return size;
      break;
    }
    offset += length;
  }
  throw new Error("JPEG 帧尺寸或图像标记无效");
}

export async function download(url, file, fetchImpl = fetch) {
  await assertNewFile(file);
  const r = await fetchImpl(url, { headers: { "User-Agent": UA, Referer: REFERER }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("download HTTP " + r.status);
  if (!/^image\/jpe?g(?:;|$)/i.test(r.headers.get("content-type") || "")) throw new Error("下载响应不是 JPEG 图片");
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5000) throw new Error("文件过小（" + buf.length + " 字节），可能被防盗链拦截");
  jpegDimensions(buf);
  await mkdir(dirname(file), { recursive: true });
  const temp = dirname(file) + "/." + basename(file) + "." + randomUUID() + ".tmp";
  let handle;
  try {
    handle = await open(temp, "wx", 0o644);
    await handle.writeFile(buf);
    await handle.sync();
    await handle.close();
    handle = null;
    // link 原子地创建最终文件；若另一个操作先创建了目标，EEXIST 会保留它。
    await link(temp, file);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("输出文件已存在，已保留原图：" + file);
    throw error;
  } finally {
    if (handle) await handle.close();
    await unlink(temp).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
  return buf.length;
}

/** 完整流程：搜索（含兜底）→ 匹配 → 返回命中项 */
async function resolve(target, log, options) {
  let hit = pick(await suggest(target.q, log, options), target);
  if (!hit) {
    for (const alt of target.alts || []) {
      await options.wait(5000);
      log(`  ↻「${target.q}」未精确命中，改用兜底词「${alt}」`);
      hit = pick(await suggest(alt, log, options), target);
      if (hit) break;
    }
  }
  return hit;
}

/* ── 单部模式 ─────────────────────────────────────────────────────────── */

export async function fetchOne(target, outFile, log = () => {}, { fetchImpl = fetch, wait = sleep, attempts = 4 } = {}) {
  if (!target.title || !/^\d{4}$/.test(String(target.year))) throw new Error("必须提供片名和四位年份，避免下载同名错片");
  if (outFile && !/\.jpg$/i.test(outFile)) throw new Error("输出文件须使用 .jpg 扩展名");
  if (outFile) await assertNewFile(outFile);
  const hit = await resolve(target, log, { fetchImpl, wait, attempts });
  if (!hit) throw new Error("未找到片名、年份均匹配的影片，未下载；空结果也可能是限流，可稍后重试");
  const url = bigUrl(hit.img);
  let bytes = 0;
  if (outFile) bytes = await download(url, outFile, fetchImpl);
  return { hit, url, matched: true, bytes };
}

/* ── 主流程 ───────────────────────────────────────────────────────────── */

async function main() {
const args = parseArgs(process.argv.slice(2));
if (args.help || (!args.batch && args.positional.length === 0)) {
  console.log(`豆瓣电影海报抓取

用法：
  node fetch-poster.mjs "<片名>" <年份> [-o 输出.jpg]
  node fetch-poster.mjs "<片名>" <年份> --alt "<兜底关键词>" [-o 输出.jpg]
  node fetch-poster.mjs --batch targets.json -d <输出目录>

选项：-o/--out 输出文件；-d/--dest 批量目录；--alt 兜底词；-q/--quiet 简洁输出
批量格式：[{ "id": "inception", "q": "盗梦空间", "title": "盗梦空间", "year": "2010", "alts": ["克里斯托弗·诺兰"] }]
仅下载片名与年份均匹配的 JPEG；旧文件不覆盖。换图请使用新文件名。
空结果会退避重试，每次网络请求最长 15 秒。`);
  process.exitCode = args.help ? 0 : 1;
  return;
}
const log = args.quiet ? () => {} : (m) => console.log(m);

if (args.batch) {
  const targets = JSON.parse(await (await import("node:fs/promises")).readFile(args.batch, "utf8"));
  if (!args.dest) { console.error("批量模式需要 -d <输出目录>"); process.exit(1); }

  const report = [];
  for (const t of targets) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t.id || "")) throw new Error("批量 id 无效：" + t.id);
    const dest = `${args.dest.replace(/\/$/, "")}/${t.id}.jpg`;
    log(`\n▸ ${t.id}  「${t.q}」`);
    try {
      const r = await fetchOne(t, dest, log);
      report.push({ id: t.id, ok: true, file: dest, bytes: r.bytes,
        got: `${r.hit.title}(${r.hit.year})`, matched: r.matched });
      log(`  ✓ ${r.hit.title}(${r.hit.year})  ${(r.bytes / 1024).toFixed(0)}KB`);
    } catch (e) {
      report.push({ id: t.id, ok: false, why: String(e.message || e) });
      log(`  ✗ ${e.message || e}`);
    }
    await sleep(6000); // 拉长间隔，避免触发限流
  }

  const failed = report.filter((r) => !r.ok);
  console.log(`\n=== 结果 ===\n成功 ${report.length - failed.length}/${report.length}`);
  if (failed.length) console.log("失败：" + failed.map((f) => `${f.id}(${f.why})`).join(", "));
  process.exitCode = failed.length ? 1 : 0;
} else {
  const [title, year] = args.positional;
  const target = { q: title, title, year, alts: args.alts };

  try {
    const r = await fetchOne(target, args.out, log);
    console.log(r.url);
    if (args.out) console.log(`→ 已保存 ${args.out}（${(r.bytes / 1024).toFixed(0)}KB）`);
  } catch (e) {
    console.error("失败：" + (e.message || e));
    process.exit(1);
  }
}
}

if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error("失败：" + error.message); process.exitCode = 1; });
}
