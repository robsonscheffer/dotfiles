#!/usr/bin/env node
import { readFileSync, existsSync, statSync } from "fs";
import { createServer } from "http";
import { extname, join, resolve, normalize, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { renderMarkdownFile, resolveMdPath } from "../lib/md-render.mjs";

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(SKILL_DIR, "dist");
const serveShowcase = process.argv.includes("--showcase");

const CONFIG_PATH = join(homedir(), ".config", "html-artifact.json");
let config = {};
if (existsSync(CONFIG_PATH)) {
  try {
    config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {}
}

const PORT = config.port ?? 52010;
const baseDir = config.base_dir
  ? config.base_dir.replace(/^~/, homedir())
  : null;
const mdRoots = Array.isArray(config.md_roots) ? config.md_roots : [];

const roots = [{ prefix: "/", fsPath: DIST }];
if (!serveShowcase && baseDir) {
  roots.unshift(
    { prefix: "/scratch/", fsPath: join(baseDir, ".scratch", "artifact") },
    { prefix: "/artifacts/", fsPath: join(baseDir, "wiki", "artifact") },
  );
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function sendError(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(`${status} ${message}`);
}

function handleMdRoute(req, res) {
  const requestUrl = new URL(req.url || "/", "http://h");
  const rawPath = requestUrl.searchParams.get("path");

  if (mdRoots.length === 0) {
    sendError(
      res,
      500,
      "md_roots not configured. Add md_roots: [<paths>] to ~/.config/html-artifact.json",
    );
    return;
  }

  const resolved = resolveMdPath(rawPath, mdRoots);
  if (!resolved.ok) {
    sendError(res, resolved.status, resolved.error);
    return;
  }

  try {
    const html = renderMarkdownFile(resolved.absolute, mdRoots);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (err) {
    sendError(res, 500, `render failed: ${err.message}`);
  }
}

const server = createServer((req, res) => {
  const parsedUrl = new URL(req.url || "/", "http://h");
  const url = normalize(parsedUrl.pathname).replace(/\\/g, "/");

  if (url === "/md") {
    handleMdRoute(req, res);
    return;
  }

  if (url === "/") {
    const target = baseDir ? "/artifacts/index.html" : "/showcase.html";
    res.writeHead(302, { Location: target });
    res.end();
    return;
  }

  for (const { prefix, fsPath } of roots) {
    if (!url.startsWith(prefix)) continue;
    const rel = url.slice(prefix.length) || "index.html";
    let filePath = join(fsPath, rel);

    if (!resolve(filePath).startsWith(resolve(fsPath))) {
      sendError(res, 403, "Forbidden");
      return;
    }

    if (!existsSync(filePath)) continue;
    if (statSync(filePath).isDirectory())
      filePath = join(filePath, "index.html");
    if (!existsSync(filePath)) continue;

    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
    res.end(readFileSync(filePath));
    return;
  }

  sendError(res, 404, "Not found");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} in use. LaunchAgent already running?`);
    console.error(`  lsof -ti :${PORT} | xargs kill  # to force stop`);
  } else {
    console.error(`Server error: ${err.message}`);
  }
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`html-artifact  http://localhost:${PORT}`);
  if (serveShowcase)
    console.log(`  showcase  http://localhost:${PORT}/showcase.html`);
  else if (baseDir)
    console.log(`  artifacts http://localhost:${PORT}/artifacts/`);
  console.log(`  style     http://localhost:${PORT}/style/main.css`);
  if (mdRoots.length > 0)
    console.log(
      `  md        http://localhost:${PORT}/md?path=<path> (roots: ${mdRoots.length})`,
    );
});
