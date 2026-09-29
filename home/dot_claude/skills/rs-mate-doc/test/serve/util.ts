// Shared test doubles: trivial parse/render stubs, and a tmp dir helper.
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Block,
  Doc,
  Frontmatter,
  Inline,
  LinkKind,
  Ledger,
  Parse,
  ParagraphNode,
  Render,
} from "../../src/types.ts";

export async function mkTmpDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return realpath(dir);
}

function parseFrontmatter(src: string): { frontmatter: Frontmatter; rest: string } {
  const extra: Record<string, unknown> = {};
  const fm: Frontmatter = { extra };
  if (!src.startsWith("---")) return { frontmatter: fm, rest: src };
  const end = src.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: fm, rest: src };
  const block = src.slice(3, end).trim();
  const rest = src.slice(end + 4).replace(/^\n/, "");
  for (const line of block.split("\n")) {
    const m = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, key, value] = m;
    if (key === "title" || key === "summary" || key === "status" || key === "type") {
      (fm as unknown as Record<string, unknown>)[key] = value;
    } else {
      extra[key!] = value;
    }
  }
  return { frontmatter: fm, rest };
}

// Recognizes `[[Wikilink]]` and `[label](path.md)` in a paragraph of plain
// text; everything else stays a text node. Good enough for serve tests,
// which don't exercise the real markdown grammar.
function parseInlineLinks(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\[\[([^\]]+)\]\]|\[([^\]]*)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pos = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index), pos });
    if (m[1] !== undefined) {
      out.push({
        type: "link",
        kind: "wiki" as LinkKind,
        target: m[1],
        children: [{ type: "text", value: m[1], pos }],
        pos,
      });
    } else {
      out.push({
        type: "link",
        kind: "md" as LinkKind,
        target: m[3]!,
        children: [{ type: "text", value: m[2] ?? m[3]!, pos }],
        pos,
      });
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last), pos });
  return out;
}

export const stubParse: Parse = (src, path) => {
  const { frontmatter, rest } = parseFrontmatter(src);
  const pos = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
  const paragraph: ParagraphNode = { type: "paragraph", children: parseInlineLinks(rest), pos };
  const body: Block[] = rest.trim() ? [paragraph] : [];
  const doc: Doc = {
    path,
    frontmatter,
    body,
    headings: [],
    claimRefs: [],
    errors: [],
  };
  return doc;
};

// Renders link targets through opts.resolveLink so tests can see resolved
// vs. unresolved markers without a real renderer.
export const stubRender: Render = (doc: Doc, _ledger: Ledger | null, opts) => {
  const parts: string[] = [];
  function renderInline(node: Inline): string {
    if (node.type === "text") return node.value;
    if (node.type === "link") {
      const href = opts.resolveLink ? opts.resolveLink(node) : node.target;
      if (href === null) return `<span class="unresolved">${node.target}</span>`;
      return `<a href="${href}">${node.children.map(renderInline).join("")}</a>`;
    }
    return "";
  }
  for (const block of doc.body) {
    if (block.type === "paragraph") {
      parts.push(`<p>${block.children.map(renderInline).join("")}</p>`);
    }
  }
  return `<html><body>${parts.join("\n")}</body></html>`;
};

export const stubRenderPlain: Render = () => "<html>stub</html>";

// Renders nav (breadcrumbs, side nav, prev/next) as plain markup so nav tests can assert on it
// without a real renderer.
export const stubRenderNav: Render = (doc, _ledger, opts) => {
  const nav = opts.nav;
  const navHtml = nav
    ? `<nav class="breadcrumbs">${nav.breadcrumbs
        .map((b) => `<a href="${b.href}">${b.title}</a>`)
        .join(" / ")}</nav>` +
      `<nav class="left-nav"><ul>${nav.pages
        .map(
          (p) =>
            `<li class="${p.current ? "current" : ""}"><a href="${p.href}">${p.title}</a></li>`,
        )
        .join("")}</ul></nav>` +
      (nav.prev ? `<a class="prev" href="${nav.prev.href}">${nav.prev.title}</a>` : "") +
      (nav.next ? `<a class="next" href="${nav.next.href}">${nav.next.title}</a>` : "")
    : "<span class=\"no-nav\"></span>";
  return `<html><body>${navHtml}<h1>${doc.frontmatter.title ?? ""}</h1></body></html>`;
};

export const nullLedger = (): Ledger | null => null;
