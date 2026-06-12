import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, dirname, basename, extname, join, sep } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { marked } from "marked";
import matter from "gray-matter";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_PATH = resolve(SKILL_DIR, "dist/templates/md.html");
const MD_EXTENSIONS = new Set([".md", ".markdown"]);
const TICKET_PATH_RE =
  /\/docs\/plans\/(active|done)\/([A-Z]+-\d+)(?:-[a-z0-9-]+)?\/README\.md$/;
const EPIC_PATH_RE = /\/docs\/epics\/([^/]+)\.md$/;

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
    (root) => absolute === root || absolute.startsWith(root + sep),
  );
  if (!inRoot) {
    return { ok: false, status: 403, error: "path outside allowed roots" };
  }

  if (!existsSync(absolute)) {
    return { ok: false, status: 404, error: "file not found" };
  }

  return { ok: true, absolute };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mdHref(absolutePath, fragment = "") {
  return `/md?path=${encodeURIComponent(absolutePath)}${fragment ? "#" + fragment : ""}`;
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
          absoluteTarget === root || absoluteTarget.startsWith(root + sep),
      );
      if (!allowed) return match;

      return `<a${before} href="${mdHref(absoluteTarget, fragment)}"${after}>`;
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

function deriveTitle(data, content, fallback) {
  if (data && typeof data.title === "string" && data.title.trim())
    return data.title.trim();
  if (data && typeof data.id === "string" && data.id.trim())
    return data.id.trim();
  const h1 = content.match(/^#\s+(.+?)\s*$/m);
  if (h1) return h1[1].trim();
  return fallback;
}

function detectContext(absolutePath, frontmatter) {
  const ticketMatch = absolutePath.match(TICKET_PATH_RE);
  if (ticketMatch) {
    return {
      kind: "ticket",
      bucket: ticketMatch[1],
      id: ticketMatch[2],
      prefix: ticketMatch[2].split("-")[0],
      number: Number(ticketMatch[2].split("-")[1]),
      epicRef:
        frontmatter && frontmatter.epic ? String(frontmatter.epic) : null,
      status:
        frontmatter && frontmatter.status ? String(frontmatter.status) : null,
    };
  }
  const epicMatch = absolutePath.match(EPIC_PATH_RE);
  if (epicMatch) {
    return { kind: "epic", slug: epicMatch[1] };
  }
  return { kind: "generic" };
}

function findRepoRoot(filePath) {
  let dir = dirname(filePath);
  while (dir !== "/" && dir !== "") {
    if (existsSync(join(dir, "docs", "plans"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function listSiblingTickets(repoRoot, prefix) {
  if (!repoRoot) return [];
  const buckets = ["active", "done"];
  const tickets = [];
  for (const bucket of buckets) {
    const dir = join(repoRoot, "docs", "plans", bucket);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const m = name.match(new RegExp(`^(${prefix}-\\d+)(?:-[a-z0-9-]+)?$`));
      if (!m) continue;
      const readme = join(dir, name, "README.md");
      if (!existsSync(readme)) continue;
      const id = m[1];
      const number = Number(id.split("-")[1]);
      tickets.push({ id, number, bucket, path: readme });
    }
  }
  tickets.sort((a, b) => a.number - b.number);
  return tickets;
}

function resolveEpicPath(epicRef, sourceFile, repoRoot) {
  if (!epicRef) return null;
  if (epicRef.startsWith("/")) return existsSync(epicRef) ? epicRef : null;
  if (repoRoot) {
    const candidate = join(repoRoot, epicRef);
    if (existsSync(candidate)) return candidate;
  }
  const fromSource = resolve(dirname(sourceFile), epicRef);
  if (existsSync(fromSource)) return fromSource;
  return null;
}

function findDashboardForEpic(epicSlug) {
  if (!epicSlug) return null;
  const dir = join(homedir(), "brain", "wiki", "artifact", "dashboard");
  if (!existsSync(dir)) return null;
  const matches = readdirSync(dir)
    .filter((f) => f.endsWith(".html") && f.includes(epicSlug))
    .sort()
    .reverse();
  if (matches.length === 0) return null;
  return `/artifacts/dashboard/${matches[0]}`;
}

function buildBreadcrumb(context, absolutePath, allowedRoots) {
  const parts = [];
  if (context.kind === "ticket") {
    const repoRoot = findRepoRoot(absolutePath);
    const epicPath = resolveEpicPath(context.epicRef, absolutePath, repoRoot);
    if (epicPath) {
      const epicSlug = basename(epicPath, ".md");
      parts.push(
        `<a class="crumb-link" href="${mdHref(epicPath)}">${escapeHtml(epicSlug)}</a>`,
      );
    } else {
      parts.push(
        `<span class="crumb-here">${escapeHtml(context.prefix.toLowerCase())}</span>`,
      );
    }
    parts.push(`<span class="crumb-here">${escapeHtml(context.id)}</span>`);
  } else if (context.kind === "epic") {
    parts.push(
      `<span class="crumb-here">epic / ${escapeHtml(context.slug)}</span>`,
    );
  } else {
    parts.push(
      `<span class="crumb-here">${escapeHtml(basename(absolutePath))}</span>`,
    );
  }
  return parts.map((p) => `<span class="sep">›</span>${p}`).join("");
}

function buildContextNav(context, absolutePath) {
  if (context.kind === "generic") return "";

  const repoRoot = findRepoRoot(absolutePath);
  const items = [];

  if (context.kind === "ticket") {
    const siblings = listSiblingTickets(repoRoot, context.prefix);
    const idx = siblings.findIndex((t) => t.path === absolutePath);
    const prev = idx > 0 ? siblings[idx - 1] : null;
    const next =
      idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

    items.push(
      prev
        ? `<a href="${mdHref(prev.path)}">◀ ${escapeHtml(prev.id)}</a>`
        : `<a class="disabled" href="#">◀ prev</a>`,
    );
    items.push(
      next
        ? `<a href="${mdHref(next.path)}">${escapeHtml(next.id)} ▶</a>`
        : `<a class="disabled" href="#">next ▶</a>`,
    );

    const epicPath = resolveEpicPath(context.epicRef, absolutePath, repoRoot);
    if (epicPath) {
      items.push(`<span class="ctx-spacer"></span>`);
      items.push(
        `<span class="ctx-label">epic:</span><a href="${mdHref(epicPath)}">${escapeHtml(basename(epicPath, ".md"))}</a>`,
      );
      const dashHref = findDashboardForEpic(basename(epicPath, ".md"));
      if (dashHref) {
        items.push(`<a href="${dashHref}">burndown</a>`);
      }
    } else {
      items.push(`<span class="ctx-spacer"></span>`);
      items.push(
        `<span class="ctx-label">${escapeHtml(context.prefix)} ·</span><span class="ctx-label">${siblings.length} tickets</span>`,
      );
    }
  } else if (context.kind === "epic") {
    const dashHref = findDashboardForEpic(context.slug);
    items.push(`<span class="ctx-spacer"></span>`);
    if (dashHref) {
      items.push(`<a href="${dashHref}">burndown</a>`);
    }
  }

  return `<nav class="md-context-nav" aria-label="Context navigation">${items.join("\n")}</nav>`;
}

export function renderMarkdownFile(absolutePath, allowedRoots) {
  const raw = readFileSync(absolutePath, "utf8");
  const parsed = matter(raw);
  const { data, content } = parsed;

  const rawHtml = marked.parse(content);
  const html = rewriteRelativeMdLinks(rawHtml, absolutePath, allowedRoots);

  const title = deriveTitle(data, content, basename(absolutePath));
  const railHtml = renderRail(data);
  const context = detectContext(absolutePath, data);
  const breadcrumb = buildBreadcrumb(context, absolutePath, allowedRoots);
  const contextNav = buildContextNav(context, absolutePath);
  const navMeta =
    context.kind === "ticket"
      ? context.id
      : context.kind === "epic"
        ? "epic"
        : "";

  const template = readFileSync(TEMPLATE_PATH, "utf8");
  return template
    .replace(/<!-- TITLE -->/g, escapeHtml(title))
    .replace("<!-- BREADCRUMB -->", breadcrumb)
    .replace("<!-- CONTEXT_NAV -->", contextNav)
    .replace("<!-- NAV_META -->", escapeHtml(navMeta))
    .replace("<!-- CONTENT -->", html)
    .replace("<!-- RAIL -->", railHtml)
    .replace(
      "<!-- SOURCE_PATH -->",
      escapeHtml(absolutePath.replace(homedir(), "~")),
    );
}
