// L5: the local viewer server. Binds loopback-only, serves only remembered
// folders, live-reloads on file change.
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RenderOptions, ServeOptions, ServerHandle } from "../types.ts";
import { contentTypeFor } from "./content-type.ts";
import { collectFolderListing, renderFolderListing } from "./folder-view.ts";
import { precomputeResolvedLinks } from "./link-resolve.ts";
import { resolveSafePath } from "./security.ts";
import { loadFolders, type RememberedFolder } from "./state.ts";
import { createSseHub, LIVE_RELOAD_PATH, liveReloadClientScript } from "./sse.ts";
import { THEME_CSS, THEME_TOGGLE_SCRIPT } from "../render/theme.ts";
import { createWatcher } from "./watch.ts";

function notFound(): Response {
  return new Response("not found", { status: 404 });
}

function renderIndex(folders: RememberedFolder[]): string {
  const items = folders
    .map((f) => `<li><a href="/${encodeURIComponent(f.alias)}/">${f.alias}</a></li>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>mate-doc</title>
<style>${THEME_CSS}</style>
</head>
<body class="no-nav">
<button type="button" class="theme-toggle" aria-label="Toggle color theme">Theme</button>
<div class="layout"><main><header class="doc-header"><h1>Remembered folders</h1></header><ul>${items}</ul></main></div>
<script>${THEME_TOGGLE_SCRIPT}</script>
</body>
</html>`;
}

export async function serve(opts: ServeOptions): Promise<ServerHandle> {
  if (opts.host !== "127.0.0.1") {
    throw new Error(`mate-doc serve: refusing to bind host "${opts.host}", loopback only.`);
  }

  const hub = createSseHub();
  const watcher = createWatcher(() => hub.broadcast("reload"));
  const watchedFolders = new Set<string>();

  function ensureWatched(folder: RememberedFolder): void {
    if (watchedFolders.has(folder.path)) return;
    watchedFolders.add(folder.path);
    watcher.addFolder(folder.path);
  }

  async function serveDoc(
    folder: RememberedFolder,
    abs: string,
    urlPath: string,
  ): Promise<Response> {
    const src = await readFile(abs, "utf8");
    const doc = opts.parse(src, abs);
    const docDir = dirname(abs);
    const ledger = opts.loadLedger(docDir);
    const folders = (await loadFolders(opts.stateDir)).folders;
    const resolved = await precomputeResolvedLinks(folders, abs, doc);
    const renderOptions: RenderOptions = {
      theme: "auto",
      liveReload: LIVE_RELOAD_PATH,
      resolveLink: (node) => resolved.get(node) ?? null,
    };
    const html = opts.render(doc, ledger, renderOptions);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  async function serveFolder(folder: RememberedFolder, dirAbs: string): Promise<Response> {
    const indexMd = `${dirAbs}/index.md`;
    try {
      await readFile(indexMd, "utf8");
      return serveDoc(folder, indexMd, "");
    } catch {
      // no index.md: fall through to the generated listing
    }
    const listing = await collectFolderListing(dirAbs, opts.parse);
    const rel = dirAbs.slice(folder.path.length);
    const html =
      renderFolderListing(folder.alias, `/${folder.alias}${rel}`, listing) +
      liveReloadClientScript();
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  async function fetchHandler(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === LIVE_RELOAD_PATH) {
      return hub.subscribe();
    }

    const state = await loadFolders(opts.stateDir);

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(renderIndex(state.folders), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const segments = url.pathname.split("/").filter(Boolean);
    const alias = segments[0];
    const folder = state.folders.find((f) => f.alias === alias);
    if (!alias || !folder) return notFound();

    ensureWatched(folder);

    const rest = segments.slice(1).join("/");
    const resolved = await resolveSafePath(folder.path, rest);
    if (resolved.kind === "notfound") return notFound();
    if (resolved.kind === "dir") return serveFolder(folder, resolved.abs);

    if (resolved.abs.endsWith(".md")) {
      return serveDoc(folder, resolved.abs, url.pathname);
    }
    const file = Bun.file(resolved.abs);
    return new Response(file, { headers: { "Content-Type": contentTypeFor(resolved.abs) } });
  }

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: opts.port,
    fetch: fetchHandler,
  });

  // Watch whatever is already remembered at startup.
  const initial = await loadFolders(opts.stateDir);
  for (const folder of initial.folders) ensureWatched(folder);

  return {
    url: `http://127.0.0.1:${server.port}`,
    async stop() {
      watcher.stop();
      hub.closeAll();
      await server.stop(true);
    },
  };
}
