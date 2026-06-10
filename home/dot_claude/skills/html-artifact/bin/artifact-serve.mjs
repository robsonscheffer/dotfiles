#!/usr/bin/env node
import { readFileSync, existsSync, statSync } from "fs";
import { createServer } from "http";
import { extname, join, resolve, normalize, dirname } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { homedir } from "os";

const serveShowcase = process.argv.includes("--showcase");

let serveRoot;
let openPath;

if (serveShowcase) {
  serveRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
  openPath = "showcase.html";
  if (!existsSync(serveRoot)) {
    console.error(`dist/ not found: ${serveRoot}. Run the Vite build first.`);
    process.exit(1);
  }
} else {
  const CONFIG_PATH = join(homedir(), ".config", "html-artifact.json");

  if (!existsSync(CONFIG_PATH)) {
    console.error(
      "html-artifact not configured. Run any html-artifact operation first.",
    );
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    console.error(
      "html-artifact: config file is malformed JSON. Delete ~/.config/html-artifact.json and re-run the skill.",
    );
    process.exit(1);
  }

  const baseDir = config.base_dir.replace(/^~/, homedir());
  serveRoot = join(baseDir, "wiki", "artifact");
  openPath = "index.html";

  if (!existsSync(serveRoot)) {
    console.error(`Artifact dir not found: ${serveRoot}`);
    process.exit(1);
  }
}

const artifactDir = serveRoot;

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer((req, res) => {
  const safePath = normalize(req.url).replace(/^\/+/, "");
  let filePath = join(artifactDir, safePath || "index.html");

  if (!resolve(filePath).startsWith(resolve(artifactDir))) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  // serve index.html for directory requests
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
  res.end(readFileSync(filePath));
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  const url = `http://localhost:${port}/${openPath}`;
  console.log(`Serving ${artifactDir}`);
  console.log(`Open: ${url}`);
  const open = process.platform === "darwin" ? "open" : "xdg-open";
  exec(`${open} "${url}"`, (err) => {
    if (err) console.warn(`Could not open browser: ${err.message}`);
  });
});
