import { readFileSync, existsSync } from "fs";
import { resolve, dirname, basename, extname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { marked } from "marked";
import matter from "gray-matter";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_PATH = resolve(SKILL_DIR, "dist/templates/md.html");
const MD_EXTENSIONS = new Set([".md", ".markdown"]);

marked.setOptions({ gfm: true, breaks: false });

export function expandPath(p) {
  if (!p) return p;
  if (p.startsWith("~/") || p === "~") {
    return p.replace(/^~/, homedir());
  }
  return p;
}

export function resolveMdPath(rawPath, allowedRoots) {
  if (!rawPath) {
    return { ok: false, status: 400, error: "missing path" };
  }
  if (rawPath.includes("\0")) {
    return { ok: false, status: 400, error: "invalid path" };
  }

  const expanded = expandPath(rawPath);
  const absolute = resolve(expanded);

  if (!MD_EXTENSIONS.has(extname(absolute).toLowerCase())) {
    return {
      ok: false,
      status: 415,
      error: "unsupported extension (only .md and .markdown)",
    };
  }

  const normalizedRoots = allowedRoots.map((r) => resolve(expandPath(r)));
  const inRoot = normalizedRoots.some(
    (root) => absolute === root || absolute.startsWith(root + "/"),
  );
  if (!inRoot) {
    return { ok: false, status: 403, error: "path outside allowed roots" };
  }

  if (!existsSync(absolute)) {
    return { ok: false, status: 404, error: "file not found" };
  }

  return { ok: true, absolute };
}

function rewriteRelativeMdLinks(html, sourceFile, allowedRoots) {
  const fileDir = dirname(sourceFile);
  const normalizedRoots = allowedRoots.map((r) => resolve(expandPath(r)));

  return html.replace(
    /<a\b([^>]*?)\shref="([^"]+)"([^>]*)>/gi,
    (match, before, href, after) => {
      if (/^(https?:|mailto:|#|\/|data:)/i.test(href)) return match;
      const [pathPart, fragment = ""] = href.split("#");
      if (!/\.(md|markdown)$/i.test(pathPart)) return match;

      const absoluteTarget = resolve(fileDir, pathPart);
      const allowed = normalizedRoots.some(
        (root) =>
          absoluteTarget === root || absoluteTarget.startsWith(root + "/"),
      );
      if (!allowed) return match;

      const newHref = `/md?path=${encodeURIComponent(absoluteTarget)}${fragment ? "#" + fragment : ""}`;
      return `<a${before} href="${newHref}"${after}>`;
    },
  );
}

function renderRail(data) {
  const entries = Object.entries(data).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return "";
  return entries
    .map(([key, value]) => {
      const display = Array.isArray(value) ? value.join(", ") : String(value);
      return `
  <div class="spec-rail-row">
    <div class="spec-rail-label">${escapeHtml(key)}</div>
    <div class="spec-rail-value">${escapeHtml(display)}</div>
  </div>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function deriveTitle(data, content, fallback) {
  if (data && typeof data.title === "string" && data.title.trim())
    return data.title.trim();
  if (data && typeof data.id === "string" && data.id.trim())
    return data.id.trim();
  const h1 = content.match(/^#\s+(.+?)\s*$/m);
  if (h1) return h1[1].trim();
  return fallback;
}

export function renderMarkdownFile(absolutePath, allowedRoots) {
  const raw = readFileSync(absolutePath, "utf8");
  const parsed = matter(raw);
  const { data, content } = parsed;

  const rawHtml = marked.parse(content);
  const html = rewriteRelativeMdLinks(rawHtml, absolutePath, allowedRoots);

  const title = deriveTitle(data, content, basename(absolutePath));
  const railHtml = renderRail(data);

  const template = readFileSync(TEMPLATE_PATH, "utf8");
  return template
    .replace(/<!-- TITLE -->/g, escapeHtml(title))
    .replace("<!-- CONTENT -->", html)
    .replace("<!-- RAIL -->", railHtml)
    .replace(
      "<!-- SOURCE_PATH -->",
      escapeHtml(absolutePath.replace(homedir(), "~")),
    );
}
