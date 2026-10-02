#!/usr/bin/env node
/* 只复制站点运行所需文件。源文件继续在项目根目录维护，dist 可随时重新生成。 */
import { copyFile, mkdir, realpath, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, insideRoot, loadMovieData } from "./validate-data.mjs";

export async function build(root = ROOT) {
  const base = await realpath(root);
  const db = await loadMovieData(base);
  const files = [...new Set([
    "index.html", "data.js", "assets/css/lmdb.css", "assets/js/lmdb.js",
    "assets/favicon.svg", "assets/logo.png", "assets/logo-display.png",
    ...db.movies.flatMap(m => [m.poster, m.posterPreview, m.posterThumb].filter(Boolean)),
  ])];
  const sources = await Promise.all(files.map(async file => {
    const source = await realpath(resolve(base, file));
    if (!insideRoot(base, source)) throw new Error("发布文件指向项目外：" + file);
    return source;
  }));
  const output = resolve(base, "dist");
  await rm(output, { recursive: true, force: true });
  for (const [index, file] of files.entries()) {
    const target = resolve(output, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(sources[index], target);
  }
  return { output, files, movies: db.movies.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await build();
    console.log(`PASS 发布包：${result.movies} 部影片，${result.files.length} 个文件 → dist/`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
