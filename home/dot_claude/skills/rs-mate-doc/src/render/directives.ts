import type { DirectiveNode, TableNode } from "../types.ts";
import type { Ctx } from "./ctx.ts";
import { nextId } from "./ctx.ts";
import { buildFlowSvg } from "./flow.ts";
import { renderClaimMarker } from "./inline.ts";
import { collectLinks, linkHref, renderInline } from "./inline.ts";
import { escapeAttr, escapeHtml, plainTextOf } from "./util.ts";

// block.ts calls into here for directive nodes; renderCallout/renderRisks etc. call back into
// block.ts for ordinary children. Both modules only reach across at call time, after both are
// fully initialized, so the circular import is safe.
import { renderBlock, renderBlocks, renderTable } from "./block.ts";

export function renderDirective(n: DirectiveNode, ctx: Ctx): string {
  if (!n.known) {
    const body = n.children.length ? renderBlocks(n.children, ctx) : "";
    return `<div class="directive-unknown">Unknown directive: ${escapeHtml(n.name)}${body}</div>`;
  }
  switch (n.name) {
    case "means":
      return renderCallout("means", "What it means", n, ctx);
    case "warn":
      return renderCallout("warn", "Warning", n, ctx);
    case "note":
      return renderCallout("note", "Note", n, ctx);
    case "collide":
      return renderCollide(n, ctx);
    case "tiles":
      return renderTiles(n, ctx);
    case "flow":
      return buildFlowSvg(n.raw ?? []);
    case "steps":
      return renderSteps(n, ctx);
    case "tabs":
      return renderTabs(n, ctx);
    case "cards":
      return renderCards(n, ctx);
    case "decide":
      return renderDecide(n, ctx);
    case "risks":
      return renderRisks(n, ctx);
    case "notverified":
      return renderNotVerified(ctx);
    default:
      return `<div class="directive-unhandled">${escapeHtml(n.name)}</div>`;
  }
}

function renderCallout(kind: string, title: string, n: DirectiveNode, ctx: Ctx): string {
  return `<aside class="callout callout-${kind}"><p class="callout-title">${escapeHtml(title)}</p>${renderBlocks(n.children, ctx)}</aside>`;
}

function renderCollide(n: DirectiveNode, ctx: Ctx): string {
  const term = n.args[0] ?? "";
  const body = renderBlocks(n.children, ctx);
  const html = `<aside class="callout callout-collide"><p class="callout-title">Term collision: ${escapeHtml(term)}</p>${body}</aside>`;
  if (term) {
    ctx.terms.set(term.toLowerCase(), { term, tooltip: plainTextOf(n.children).slice(0, 200) });
  }
  return html;
}

// A stat tile: "value" plus an optional delta with direction, e.g. "1,204 +12% up
// good-when:up". `good-when` says which direction counts as an improvement, so tone follows
// meaning rather than the sign of the delta; it defaults to "up" (more is better) when left off.
interface StatDelta {
  value: string;
  delta: string;
  direction: "up" | "down";
  goodWhen: "up" | "down";
}

const STAT_DELTA_RE = /^(.*\S)\s+([+-]\S+)\s+(up|down)(?:\s+good-when:(up|down))?$/;

function parseStatDelta(rest: string): StatDelta | null {
  const m = STAT_DELTA_RE.exec(rest);
  if (!m) return null;
  return { value: m[1]!, delta: m[2]!, direction: m[3] as "up" | "down", goodWhen: (m[4] as "up" | "down" | undefined) ?? "up" };
}

function renderTileDelta(stat: StatDelta): string {
  const tone = stat.direction === stat.goodWhen ? "good" : "bad";
  const arrow = stat.direction === "up" ? "▲" : "▼";
  return `<div class="tile-delta tile-delta-${tone}" data-direction="${escapeAttr(stat.direction)}">${arrow} ${escapeHtml(stat.delta)}</div>`;
}

function renderTiles(n: DirectiveNode, ctx: Ctx): string {
  const lines = n.raw ?? [];
  const tiles = lines
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return "";
      const label = line.slice(0, idx).trim();
      let rest = line.slice(idx + 1).trim();
      const claimMatch = /\{(C\d+)\}/.exec(rest);
      let claimHtml = "";
      if (claimMatch) {
        rest = rest.replace(claimMatch[0], "").trim();
        claimHtml = renderClaimMarker({ type: "claimRef", id: claimMatch[1] as `C${number}`, pos: n.pos }, ctx);
      }
      const stat = parseStatDelta(rest);
      const value = stat ? stat.value : rest;
      const deltaHtml = stat ? renderTileDelta(stat) : "";
      return `<div class="tile"><div class="tile-value">${escapeHtml(value)}${claimHtml}</div>${deltaHtml}<div class="tile-label">${escapeHtml(label)}</div></div>`;
    })
    .filter(Boolean)
    .join("");
  return `<div class="tiles">${tiles}</div>`;
}

function renderSteps(n: DirectiveNode, ctx: Ctx): string {
  const items = n.children
    .map((child, i) => `<li class="step"><span class="step-number">${i + 1}</span><div class="step-body">${renderBlock(child, ctx)}</div></li>`)
    .join("");
  return `<ol class="steps">${items}</ol>`;
}

interface TabGroup {
  title: string;
  body: Parameters<typeof renderBlocks>[0];
}

// Each heading in the directive's children starts a new tab; the blocks that follow it (up to
// the next heading) become that tab's body. The heading itself becomes only the tab's button
// label, never part of the panel content.
function groupTabs(children: DirectiveNode["children"]): TabGroup[] {
  const groups: TabGroup[] = [];
  let current: TabGroup | null = null;
  for (const child of children) {
    if (child.type === "heading") {
      current = { title: plainTextOf(child.children), body: [] };
      groups.push(current);
    } else {
      if (!current) {
        current = { title: `Tab ${groups.length + 1}`, body: [] };
        groups.push(current);
      }
      current.body.push(child);
    }
  }
  return groups;
}

function renderTabs(n: DirectiveNode, ctx: Ctx): string {
  const tabs = groupTabs(n.children).map((g) => ({ title: g.title, html: renderBlocks(g.body, ctx), id: nextId(ctx, "tab") }));
  const buttons = tabs
    .map((t, i) => `<button type="button" class="tab-btn" data-tab="${t.id}"${i === 0 ? ' aria-selected="true"' : ""}>${escapeHtml(t.title)}</button>`)
    .join("");
  const panels = tabs.map((t, i) => `<div class="tab-panel" id="${t.id}"${i === 0 ? "" : " hidden"}>${t.html}</div>`).join("");
  const rootId = nextId(ctx, "tabs");
  return (
    `<div class="tabs" id="${rootId}">` +
    `<div class="tab-buttons" role="tablist">${buttons}</div>` +
    `<div class="tab-panels">${panels}</div>` +
    `</div>` +
    `<script>(function(){var root=document.getElementById(${JSON.stringify(rootId)});if(!root)return;` +
    `root.querySelectorAll(".tab-btn").forEach(function(btn){btn.addEventListener("click",function(){` +
    `root.querySelectorAll(".tab-btn").forEach(function(b){b.removeAttribute("aria-selected")});` +
    `btn.setAttribute("aria-selected","true");` +
    `root.querySelectorAll(".tab-panel").forEach(function(p){p.hidden=true});` +
    `document.getElementById(btn.dataset.tab).hidden=false;});});})();</script>`
  );
}

function renderCards(n: DirectiveNode, ctx: Ctx): string {
  const links = collectLinks(n.children as unknown as { children?: unknown[] }[]);
  const cards = links
    .map((l) => {
      const href = linkHref(l, ctx);
      const label = renderInline(l.children, ctx);
      if (href == null) return `<div class="card card-unresolved">${label}</div>`;
      const rel = l.kind === "url" ? ' rel="noopener noreferrer"' : "";
      return `<a class="card" href="${escapeAttr(href)}"${rel}>${label}</a>`;
    })
    .join("");
  return `<div class="cards">${cards}</div>`;
}

function renderDecide(n: DirectiveNode, ctx: Ctx): string {
  const owner = n.args[0] ?? "unassigned";
  return (
    `<aside class="callout callout-decide"><p class="callout-title">Open question</p>` +
    `${renderBlocks(n.children, ctx)}<p class="decide-owner">Decide with: ${escapeHtml(owner)}</p></aside>`
  );
}

function renderRisks(n: DirectiveNode, ctx: Ctx): string {
  const body = n.children.map((child) => (child.type === "table" ? renderTable(child as TableNode, ctx, true) : renderBlock(child, ctx))).join("");
  return `<div class="risks">${body}</div>`;
}

function renderNotVerified(ctx: Ctx): string {
  const claims = (ctx.ledger?.claims ?? []).filter((c) => c.status === "not_verified");
  if (claims.length === 0) return `<div class="not-verified-list not-verified-empty">No open claims.</div>`;
  const items = claims
    .map(
      (c) =>
        `<li><span class="claim-id">${escapeHtml(c.id)}</span> ` +
        `<span class="claim-text">${escapeHtml(c.claim)}</span> ` +
        `<span class="claim-owner">Owner: ${escapeHtml(c.owner ?? "unassigned")}</span></li>`,
    )
    .join("");
  return `<ul class="not-verified-list">${items}</ul>`;
}
