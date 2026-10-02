#!/usr/bin/env node
/* LUDB 本机预览：node tools/serve.mjs；默认 8765，可用 PORT=xxxx 改端口。 */
import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, POSTER_PATH, insideRoot, loadMovieData } from "./validate-data.mjs";

const PORT = Number(process.env.PORT) || 8765;
const PUBLIC_FILES = new Set(["/index.html", "/data.js", "/assets/css/lmdb.css", "/assets/js/lmdb.js", "/assets/favicon.svg", "/assets/logo.png", "/assets/logo-display.png"]);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
};
const isPublic = path => PUBLIC_FILES.has(path) || (path.startsWith("/") && POSTER_PATH.test(path.slice(1)));

export function createPreviewServer({ root = ROOT, onError = console.error } = {}) {
  const rootPath = resolve(root);
  const realRoot = realpath(rootPath);
  return createServer(async (req, res) => {
    const reply = (status, text, headers = {}) => {
      res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", ...headers });
      res.end(req.method === "HEAD" ? undefined : text);
    };
    if (req.method !== "GET" && req.method !== "HEAD") return reply(405, "405", { Allow: "GET, HEAD" });
    let path;
    try { path = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
    catch { return reply(400, "400"); }
    if (path === "/") path = "/index.html";
    if (!isPublic(path)) return reply(404, "404");
    try {
      const base = await realRoot;
      const file = await realpath(resolve(rootPath, "." + path));
      // 同时检查真实目标，阻止素材符号链接指向项目外或维护文件。
      if (!insideRoot(base, file) || !isPublic("/" + relative(base, file).split(sep).join("/")) || !(await stat(file)).isFile()) {
        return reply(404, "404");
      }
      const buf = await readFile(file);
      if (path === "/data.js") await loadMovieData(rootPath, buf.toString("utf8"));
      res.writeHead(200, {
        "Content-Type": TYPES[extname(file).toLowerCase()], "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff", "Content-Length": buf.length,
      });
      res.end(req.method === "HEAD" ? undefined : buf);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return reply(404, "404");
      onError("LUDB 服务读取失败：", error.message);
      reply(500, "500");
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await loadMovieData();
    const server = createPreviewServer();
    server.on("error", error => { console.error("LUDB 服务启动失败：" + error.message); process.exitCode = 1; });
    server.listen(PORT, "127.0.0.1", () => console.log(`LUDB → http://localhost:${PORT}  (仅本机访问)`));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
