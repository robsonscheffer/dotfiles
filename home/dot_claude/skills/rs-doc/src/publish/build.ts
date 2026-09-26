// Builds a doc for publishing: a single page becomes its HTML; a folder becomes a zip rooted at
// index.html, carrying every rendered page plus every non-markdown asset.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { Ledger, Parse, Render } from "../types.ts";
import { buildZip, type ZipEntry } from "./zip.ts";

export interface BuiltPage {
  kind: "page";
  html: string;
}
export interface BuiltFolder {
  kind: "folder";
  zip: Uint8Array;
}
export type BuiltDoc = BuiltPage | BuiltFolder;

export interface ResolvedDoc {
  docDir: string; // folder holding claims.yaml, for gate/audit/ledger
  isFolder: boolean;
  primaryMdPath: string; // the page carrying status/ledger_hash frontmatter
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

async function findAssetFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "claims.yaml") continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && !entry.name.endsWith(".md")) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

// Resolves a CLI-given path (a single .md file, or a folder) to the doc folder that carries
// claims.yaml, and to the primary markdown file whose frontmatter (status, ledger_hash) governs
// the whole doc.
export async function resolveDoc(docPath: string): Promise<ResolvedDoc> {
  const stats = await stat(docPath);
  if (stats.isFile()) {
    const dir = join(docPath, "..");
    return { docDir: dir, isFolder: false, primaryMdPath: docPath };
  }

  const indexPath = join(docPath, "index.md");
  try {
    await stat(indexPath);
    return { docDir: docPath, isFolder: true, primaryMdPath: indexPath };
  } catch {
    // no index.md: fall back to the first markdown file, alphabetically, so builds are stable
    const files = (await findMarkdownFiles(docPath)).sort();
    const first = files[0];
    if (!first) throw new Error(`no markdown files found under ${docPath}`);
    return { docDir: docPath, isFolder: true, primaryMdPath: first };
  }
}

function htmlNameFor(mdPath: string, primaryMdPath: string, docDir: string): string {
  if (mdPath === primaryMdPath) return "index.html";
  const rel = relative(docDir, mdPath);
  return rel.slice(0, -3) + ".html";
}

export async function buildDoc(
  resolved: ResolvedDoc,
  ledger: Ledger | null,
  parse: Parse,
  render: Render,
): Promise<BuiltDoc> {
  if (!resolved.isFolder) {
    const src = await readFile(resolved.primaryMdPath, "utf8");
    const doc = parse(src, resolved.primaryMdPath);
    const html = render(doc, ledger, { theme: "auto" });
    return { kind: "page", html };
  }

  const mdFiles = await findMarkdownFiles(resolved.docDir);
  const assetFiles = await findAssetFiles(resolved.docDir);
  const entries: ZipEntry[] = [];

  for (const mdPath of mdFiles) {
    const src = await readFile(mdPath, "utf8");
    const doc = parse(src, mdPath);
    const html = render(doc, ledger, { theme: "auto" });
    const name = htmlNameFor(mdPath, resolved.primaryMdPath, resolved.docDir);
    entries.push({ name, data: new TextEncoder().encode(html) });
  }
  for (const assetPath of assetFiles) {
    const data = await readFile(assetPath);
    const name = relative(resolved.docDir, assetPath).split(sep).join("/");
    entries.push({ name, data: new Uint8Array(data) });
  }

  return { kind: "folder", zip: buildZip(entries) };
}
