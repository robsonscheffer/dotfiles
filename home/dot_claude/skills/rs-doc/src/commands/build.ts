// `mate-doc build <path> [--out dir]`: write self-contained HTML. File or folder.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, normalize, relative, sep } from "node:path";
import { createEnv } from "../env.ts";
import { gate } from "../gate/index.ts";
import { loadLedger } from "../ledger/index.ts";
import { parse } from "../parser/index.ts";
import { render } from "../render/index.ts";
import { collectMarkdownFiles } from "./shared.ts";
import type { Banner, Doc, Env, GateResult, LinkNode, NavPage } from "../types.ts";
import { EXIT } from "../types.ts";

function pageKey(mdAbsPath: string, docDir: string): string {
  return relative(docDir, mdAbsPath).replace(/\.md$/, "").split(sep).join("/");
}

function htmlNameFor(mdAbsPath: string, docDir: string): string {
  return `${pageKey(mdAbsPath, docDir)}.html`;
}

function bannerFromGate(gateResult: GateResult | null, doc: Doc): Banner | undefined {
  if (!gateResult) return undefined;
  if (doc.frontmatter.shape === "plain") return undefined;
  return {
    level: gateResult.levelAfter,
    approvedAt: doc.frontmatter.approved_at,
    claims: gateResult.summary.claims,
    open: gateResult.summary.open,
    fresh: gateResult.summary.stale === 0,
  };
}

function resolveBuildLink(
  node: LinkNode,
  doc: Doc,
  docDir: string,
  byKey: Map<string, Doc>,
): string | null {
  if (node.kind === "url") return node.target;
  if (node.kind === "anchor") return node.target.startsWith("#") ? node.target : `#${node.target}`;
  if (node.kind === "md") {
    const targetAbs = normalize(join(dirname(doc.path), node.target)).replace(/\.md$/, "");
    const key = relative(docDir, targetAbs).split(sep).join("/");
    return byKey.has(key) ? `${key}.html` : null;
  }
  // wiki
  const wanted = node.target.toLowerCase();
  for (const [key] of byKey) {
    const leaf = key.split("/").pop() ?? key;
    if (leaf.toLowerCase() === wanted || key.toLowerCase() === wanted) return `${key}.html`;
  }
  return null;
}

async function buildFile(target: string, outArg: string | undefined, env: Env): Promise<number> {
  const docDir = dirname(target);
  const outDir = outArg ?? docDir;
  await mkdir(outDir, { recursive: true });

  const src = await readFile(target, "utf8");
  const doc = parse(src, target);
  const ledger = await loadLedger(docDir);
  const gateResult = ledger ? await gate(target, env) : null;
  const banner = bannerFromGate(gateResult, doc);

  const html = render(doc, ledger, {
    theme: "auto",
    banner,
    resolveLink: () => null,
  });

  const outPath = join(outDir, `${basename(target).replace(/\.md$/, "")}.html`);
  await writeFile(outPath, html, "utf8");
  process.stdout.write(`mate-doc build: wrote ${outPath}\n`);
  return EXIT.ok;
}

async function buildFolder(docDir: string, outArg: string | undefined, env: Env): Promise<number> {
  const outDir = outArg ?? join(docDir, ".build");
  await mkdir(outDir, { recursive: true });

  const mdFiles = await collectMarkdownFiles(docDir);
  const ledger = await loadLedger(docDir);

  const docs: Doc[] = [];
  for (const f of mdFiles) docs.push(parse(await readFile(f, "utf8"), f));

  const byKey = new Map(docs.map((d) => [pageKey(d.path, docDir), d] as const));
  const indexDoc = byKey.get("index");
  const tour = indexDoc?.frontmatter.tour;

  let order: string[];
  if (tour && tour.length > 0) {
    order = tour;
  } else {
    order = [...byKey.keys()].sort((a, b) => {
      if (a === "index") return -1;
      if (b === "index") return 1;
      return a.localeCompare(b);
    });
  }
  const pages = order.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!);

  const gateResult = ledger ? await gate(docDir, env) : null;

  for (const doc of docs) {
    const idx = pages.findIndex((p) => p === doc);
    const navPages: NavPage[] = pages.map((p) => ({
      title: p.frontmatter.title ?? pageKey(p.path, docDir),
      href: htmlNameFor(p.path, docDir),
      current: p === doc,
    }));
    const nav =
      pages.length > 1 && idx !== -1
        ? {
            breadcrumbs: [],
            pages: navPages,
            prev: idx > 0 ? navPages[idx - 1] : undefined,
            next: idx < navPages.length - 1 ? navPages[idx + 1] : undefined,
          }
        : undefined;

    const banner = bannerFromGate(gateResult, doc);
    const html = render(doc, ledger, {
      theme: "auto",
      nav,
      banner,
      resolveLink: (node) => resolveBuildLink(node, doc, docDir, byKey),
    });

    const outPath = join(outDir, htmlNameFor(doc.path, docDir));
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, html, "utf8");
  }

  process.stdout.write(`mate-doc build: wrote ${docs.length} page(s) to ${outDir}\n`);
  return EXIT.ok;
}

export async function runBuild(argv: string[], env: Env = createEnv()): Promise<number> {
  const [targetArg, ...rest] = argv;
  if (!targetArg) {
    process.stderr.write("mate-doc build: usage: mate-doc build <path> [--out dir]\n");
    return EXIT.usage;
  }
  const outIdx = rest.indexOf("--out");
  const outArg = outIdx !== -1 ? rest[outIdx + 1] : undefined;

  const target = normalize(targetArg);
  const st = await stat(target).catch(() => null);
  if (!st) {
    process.stderr.write(`mate-doc build: no such file or folder: ${target}\n`);
    return EXIT.usage;
  }

  return st.isFile() ? buildFile(target, outArg, env) : buildFolder(target, outArg, env);
}
