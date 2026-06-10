#!/usr/bin/env node
import { readFileSync, existsSync, statSync } from "fs";
import { createServer } from "http";
import { extname, join, resolve, normalize, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

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

// Ordered roots: first match wins
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

const server = createServer((req, res) => {
  const url = normalize(req.url || "/").replace(/\\/g, "/");

  if (url === "/" || url === "") {
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
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
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

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
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
});
