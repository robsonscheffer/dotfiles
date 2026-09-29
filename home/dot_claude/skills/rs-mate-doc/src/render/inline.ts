import type { ClaimRefNode, Evidence, Inline, LinkNode } from "../types.ts";
import type { Ctx } from "./ctx.ts";
import { escapeAttr, escapeHtml, escapeRegex } from "./util.ts";

export function renderInline(nodes: Inline[], ctx: Ctx): string {
  return nodes.map((n) => renderInlineNode(n, ctx)).join("");
}

function renderInlineNode(n: Inline, ctx: Ctx): string {
  switch (n.type) {
    case "text":
      return renderTextWithBadges(n.value, ctx);
    case "inlineCode":
      return `<code>${escapeHtml(n.value)}</code>`;
    case "emphasis":
      return `<em>${renderInline(n.children, ctx)}</em>`;
    case "strong":
      return `<strong>${renderInline(n.children, ctx)}</strong>`;
    case "link":
      return renderLink(n, ctx);
    case "image":
      return `<img src="${escapeAttr(n.src)}" alt="${escapeAttr(n.alt)}">`;
    case "claimRef":
      return renderClaimMarker(n, ctx);
    case "htmlInline":
      return n.value;
    case "break":
      return "<br>";
  }
}

export function linkHref(n: LinkNode, ctx: Ctx): string | null {
  if (n.kind === "url") return n.target;
  if (n.kind === "anchor") return n.target.startsWith("#") ? n.target : `#${n.target}`;
  // "md" or "wiki": resolved by the host, unknown to the renderer itself.
  return ctx.opts.resolveLink ? ctx.opts.resolveLink(n) : null;
}

function renderLink(n: LinkNode, ctx: Ctx): string {
  const href = linkHref(n, ctx);
  const label = renderInline(n.children, ctx);
  if (href == null) {
    return `<span class="link-unresolved" title="unresolved link">${label}</span>`;
  }
  const rel = n.kind === "url" ? ' rel="noopener noreferrer"' : "";
  return `<a href="${escapeAttr(href)}"${rel}>${label}</a>`;
}

export function collectLinks(nodes: (Inline | { children?: unknown[] })[]): LinkNode[] {
  const out: LinkNode[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; children?: unknown[] };
    if (node.type === "link") out.push(node as unknown as LinkNode);
    if (Array.isArray(node.children)) for (const c of node.children) walk(c);
  };
  for (const n of nodes) walk(n);
  return out;
}

export function collectClaimRefs(nodes: (Inline | { children?: unknown[] })[]): ClaimRefNode[] {
  const out: ClaimRefNode[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; children?: unknown[] };
    if (node.type === "claimRef") out.push(node as unknown as ClaimRefNode);
    if (Array.isArray(node.children)) for (const c of node.children) walk(c);
  };
  for (const n of nodes) walk(n);
  return out;
}

export function renderClaimMarker(n: ClaimRefNode, ctx: Ctx): string {
  const claim = ctx.ledger?.claims.find((c) => c.id === n.id);
  if (!claim) {
    return `<sup class="claim-marker claim-missing" title="claim ${escapeAttr(n.id)} not found in ledger">${escapeHtml(n.id)}</sup>`;
  }
  return `<sup class="claim-marker claim-${escapeAttr(claim.status)}" title="${escapeAttr(claim.claim)}">${escapeHtml(n.id)}</sup>`;
}

export function excerptFor(ev: Evidence): string {
  switch (ev.kind) {
    case "code":
      return ev.excerpt;
    case "link":
      return ev.excerpt ?? "";
    case "mcp":
      return ev.excerpt;
    case "query":
    case "record":
      return "";
  }
}

export function sourceLinkFor(ev: Evidence): string {
  switch (ev.kind) {
    case "code":
      return `<span class="claim-source">${escapeHtml(ev.ref)}</span>`;
    case "query":
      return `<span class="claim-source">${escapeHtml(ev.sql)}</span>`;
    case "record":
      return `<span class="claim-source">${escapeHtml(ev.ref)}</span>`;
    case "link":
      return `<a class="claim-source" href="${escapeAttr(ev.url)}" rel="noopener noreferrer">${escapeHtml(ev.url)}</a>`;
    case "mcp":
      return `<a class="claim-source" href="${escapeAttr(ev.source)}" rel="noopener noreferrer">${escapeHtml(ev.source)}</a>`;
  }
}

// Inline badge: ":badge[label]{tone=bad}". Tones: good, warn, bad, info, neutral (default).
// An unknown tone falls back to neutral rather than failing the render.
export const BADGE_RE = /:badge\[([^\]]*)\](?:\{([^}]*)\})?/g;
export const BADGE_TONES = new Set(["good", "warn", "bad", "info", "neutral"]);

function renderBadge(label: string, attrs: string | undefined): string {
  const toneMatch = attrs ? /tone\s*=\s*([a-zA-Z]+)/.exec(attrs) : null;
  const requested = toneMatch ? toneMatch[1]!.toLowerCase() : "neutral";
  const tone = BADGE_TONES.has(requested) ? requested : "neutral";
  return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
}

// Badges are recognized directly on plain text nodes rather than through a dedicated parser
// rule: the syntax never collides with anything CommonMark's inline parser already claims, so a
// regex pass here is enough and keeps the new syntax out of the shared AST contract.
function renderTextWithBadges(value: string, ctx: Ctx): string {
  if (!value.includes(":badge[")) return applyTermChips(value, ctx);
  let out = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  BADGE_RE.lastIndex = 0;
  while ((m = BADGE_RE.exec(value))) {
    out += applyTermChips(value.slice(lastIndex, m.index), ctx);
    out += renderBadge(m[1] ?? "", m[2]);
    lastIndex = m.index + m[0].length;
  }
  out += applyTermChips(value.slice(lastIndex), ctx);
  return out;
}

// Later plain-text occurrences of a term introduced by a `collide` block get a hover chip.
// Registration happens after the collide block itself renders (see directives.ts), so the
// defining occurrence is never chipped.
export function applyTermChips(text: string, ctx: Ctx): string {
  if (ctx.terms.size === 0) return escapeHtml(text);
  const entries = [...ctx.terms.values()].sort((a, b) => b.term.length - a.term.length);
  const pattern = entries.map((t) => escapeRegex(t.term)).join("|");
  const re = new RegExp(`\\b(${pattern})\\b`, "gi");
  let result = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    result += escapeHtml(text.slice(lastIndex, m.index));
    const matched = m[0]!;
    const info = entries.find((t) => t.term.toLowerCase() === matched.toLowerCase());
    result += `<span class="term-chip" title="${escapeAttr(info?.tooltip ?? "")}">${escapeHtml(matched)}</span>`;
    lastIndex = re.lastIndex;
  }
  result += escapeHtml(text.slice(lastIndex));
  return result;
}
