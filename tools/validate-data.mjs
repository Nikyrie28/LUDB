#!/usr/bin/env node
/* 数据校验：node tools/validate-data.mjs；服务启动、数据响应与冒烟测试也会调用。 */
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const POSTER_PATH = /^assets\/posters\/[a-z0-9][a-z0-9._-]*\.(?:jpg|jpeg|png|webp|svg)$/i;
export const BACKDROP_PATH = /^assets\/backdrops\/[a-z0-9][a-z0-9._-]*\.(?:jpg|jpeg|png|webp)$/i;
const IMAGE_POSITION = /^(?:100|[0-9]{1,2})(?:\.\d+)?% (?:100|[0-9]{1,2})(?:\.\d+)?%$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCORE_STATUSES = new Set(["rated", "placeholder", "unrated"]);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = value => typeof value === "string" && value.trim().length > 0;

export function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function insideRoot(root, target) {
  const path = relative(root, target);
  return !isAbsolute(path) && path !== ".." && !path.startsWith(".." + sep);
}

export function validateMovieData(db) {
  const errors = [];
  if (!isObject(db) || !Array.isArray(db.movies) || !isObject(db.meta)) {
    throw new Error("数据必须包含 meta 对象与 movies 数组");
  }
  if (!isValidDate(db.meta.updatedAt)) errors.push("meta.updatedAt 必须是有效的 YYYY-MM-DD 日期");
  if (!isValidDate(db.meta.ratingsRecordedAt)) errors.push("meta.ratingsRecordedAt 必须是有效日期");
  if (!isText(db.meta.ratingsNote)) errors.push("meta.ratingsNote 必须说明评分快照口径");
  const ids = new Set();
  db.movies.forEach((movie, index) => {
    const label = "movies[" + index + "]";
    if (!isObject(movie)) { errors.push(label + " 必须是对象"); return; }
    const name = label + "（" + (movie.title || movie.id || "未命名") + "）";
    if (typeof movie.id !== "string" || !ID.test(movie.id)) errors.push(name + " id 须使用小写英文、数字和连字符");
    if (ids.has(movie.id)) errors.push(name + " id 重复：" + movie.id);
    ids.add(movie.id);
    for (const field of ["title", "director", "country"]) {
      if (!isText(movie[field])) errors.push(name + " " + field + " 不能为空");
    }
    for (const field of ["originalTitle", "enTitle", "summary", "tagline", "review"]) {
      if (typeof movie[field] !== "string") errors.push(name + " " + field + " 必须是文本");
    }
    for (const field of ["cast", "genres"]) {
      if (!Array.isArray(movie[field]) || !movie[field].every(isText)) errors.push(name + " " + field + " 必须是文本数组");
    }
    if (!Number.isInteger(movie.year) || movie.year < 1000 || movie.year > 9999) errors.push(name + " year 必须是四位年份");
    if (!Number.isInteger(movie.runtime) || movie.runtime <= 0) errors.push(name + " runtime 必须是正整数分钟");
    if (!SCORE_STATUSES.has(movie.scoreStatus)) errors.push(name + " scoreStatus 须为 rated / placeholder / unrated");
    if (movie.scoreStatus === "unrated") {
      if (movie.myScore !== null) errors.push(name + " unrated 的 myScore 须为 null");
    } else if (typeof movie.myScore !== "number" || !Number.isFinite(movie.myScore) || movie.myScore < 0 || movie.myScore > 10) {
      errors.push(name + " myScore 须为 0–10 的数字");
    }
    if (movie.markedAt !== null && !isValidDate(movie.markedAt)) errors.push(name + " markedAt 须为有效日期或 null");
    for (const source of ["imdb", "douban"]) {
      const score = movie[source + "Score"];
      if (score !== null && (!Number.isFinite(score) || score < 0 || score > 10)) errors.push(name + " " + source + "Score 须为 0–10 数字或 null");
      const pattern = source === "imdb" ? /^https:\/\/www\.imdb\.com\/title\/tt\d+\/$/ : /^https:\/\/movie\.douban\.com\/subject\/\d+\/$/;
      if (!pattern.test(movie[source + "Url"])) errors.push(name + " " + source + "Url 须为对应平台影片链接");
    }
    if (typeof movie.poster !== "string" || !POSTER_PATH.test(movie.poster)) errors.push(name + " poster 须指向 assets/posters/ 内的图片文件");
    if (movie.posterPreview !== undefined && (typeof movie.posterPreview !== "string" || !POSTER_PATH.test(movie.posterPreview))) errors.push(name + " posterPreview 须指向 assets/posters/ 内的图片文件");
    if (movie.posterThumb !== undefined && (typeof movie.posterThumb !== "string" || !POSTER_PATH.test(movie.posterThumb))) errors.push(name + " posterThumb 须指向 assets/posters/ 内的图片文件");
    if (movie.backdrop !== undefined && (typeof movie.backdrop !== "string" || !BACKDROP_PATH.test(movie.backdrop))) errors.push(name + " backdrop 须指向 assets/backdrops/ 内的图片文件");
    for (const field of ["backdropPosition", "backdropPositionMobile"]) {
      if (movie[field] !== undefined && (!movie.backdrop || typeof movie[field] !== "string" || !IMAGE_POSITION.test(movie[field]) || movie[field].split(" ").some(value => parseFloat(value) > 100))) errors.push(name + " " + field + " 须为剧照的两个 0–100% 百分比");
    }
  });
  if (errors.length) throw new Error("数据校验失败：\n- " + errors.join("\n- "));
  return db;
}

export async function loadMovieData(root = ROOT, source) {
  const context = { window: {} };
  try {
    runInNewContext(source ?? await readFile(resolve(root, "data.js"), "utf8"), context, { timeout: 1000, filename: "data.js" });
  } catch (error) {
    throw new Error("data.js 读取或解析失败：" + error.message);
  }
  const db = validateMovieData(context.window.LMDB);
  const realRoot = await realpath(root);
  const images = db.movies.flatMap(movie => [movie.poster, movie.posterPreview, movie.posterThumb, movie.backdrop].filter(Boolean).map(poster => ({ title: movie.title, poster, pattern: poster === movie.backdrop ? BACKDROP_PATH : POSTER_PATH })));
  const errors = (await Promise.all(images.map(async movie => {
    try {
      const file = await realpath(resolve(root, movie.poster));
      if (!insideRoot(realRoot, file) || !movie.pattern.test(relative(realRoot, file).split(sep).join("/")) || !(await stat(file)).isFile()) {
        return movie.title + " 海报不在允许的素材目录内：" + movie.poster;
      }
    } catch {
      return movie.title + " 海报文件不存在或不可读：" + movie.poster;
    }
    return null;
  }))).filter(Boolean);
  if (errors.length) throw new Error("海报校验失败：\n- " + errors.join("\n- "));
  return db;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const db = await loadMovieData();
    console.log("PASS 数据与海报校验（" + db.movies.length + " 部）");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
