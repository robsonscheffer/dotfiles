import type { Block, DirectiveNode, Inline, TableNode } from "../types.ts";
import type { Ctx } from "./ctx.ts";
import { nextId } from "./ctx.ts";
import { buildFlowSvg } from "./flow.ts";
import { renderClaimMarker } from "./inline.ts";
import { collectLinks, linkHref, renderInline } from "./inline.ts";
import { escapeAttr, escapeHtml, plainTextOf } from "./util.ts";

// block.ts calls into here for directive nodes; renderCallout/renderRisks etc. call back into
// block.ts for ordinary children. Both modules only reach across at call time, after both are
// fully initialized, so the circular import is safe.
import { renderBlock, renderBlocks } from "./block.ts";

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
    case "rail":
      return renderRail(n);
    case "reveal":
      return renderReveal(n, ctx);
    case "checks":
      return renderChecks(n);
    case "timeline":
      return renderTimeline(n);
    case "progress":
      return renderProgress(n);
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
  const tabs = groupTabs(n.children).map((g) => ({
    title: g.title,
    html: renderBlocks(g.body, ctx),
    panelId: nextId(ctx, "tab"),
    btnId: nextId(ctx, "tab-btn"),
  }));
  const buttons = tabs
    .map(
      (t, i) =>
        `<button type="button" id="${t.btnId}" class="tab-btn" role="tab" data-tab="${t.panelId}" ` +
        `aria-selected="${i === 0 ? "true" : "false"}" aria-controls="${t.panelId}">${escapeHtml(t.title)}</button>`,
    )
    .join("");
  const panels = tabs
    .map(
      (t, i) =>
        `<div class="tab-panel" id="${t.panelId}" role="tabpanel" aria-labelledby="${t.btnId}"${i === 0 ? "" : " hidden"}>${t.html}</div>`,
    )
    .join("");
  const rootId = nextId(ctx, "tabs");
  return (
    `<div class="tabs" id="${rootId}">` +
    `<div class="tab-buttons" role="tablist">${buttons}</div>` +
    `<div class="tab-panels">${panels}</div>` +
    `</div>` +
    `<script>(function(){var root=document.getElementById(${JSON.stringify(rootId)});if(!root)return;` +
    `root.querySelectorAll(".tab-btn").forEach(function(btn){btn.addEventListener("click",function(){` +
    `root.querySelectorAll(".tab-btn").forEach(function(b){b.setAttribute("aria-selected","false")});` +
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
  const body = n.children.map((child) => (child.type === "table" ? renderRiskTable(child as TableNode, ctx) : renderBlock(child, ctx))).join("");
  return `<div class="risks">${body}</div>`;
}

type RiskSeverity = "high" | "med" | "low";

function riskSeverityOf(cell: Inline[]): RiskSeverity | null {
  const text = plainTextOf(cell).trim().toUpperCase();
  if (text === "HIGH" || text === "MED" || text === "LOW") return text.toLowerCase() as RiskSeverity;
  return null;
}

// One card per row, a colored left border for its severity plus the same badge chip risks
// already used in a plain table, in both themes at 4.5:1 (border and badge both key off the
// dark-safe --badge-*-text tokens, same as callout borders elsewhere on the page).
function renderRiskTable(t: TableNode, ctx: Ctx): string {
  const cards = t.rows
    .map((row) => {
      let severity: RiskSeverity | null = null;
      let severityIdx = -1;
      row.forEach((cell, i) => {
        if (severity) return;
        const s = riskSeverityOf(cell);
        if (s) {
          severity = s;
          severityIdx = i;
        }
      });
      const fields = row
        .map((cell, i) => {
          if (i === severityIdx && severity) {
            return `<span class="risk-badge risk-${severity}">${escapeHtml(severity.toUpperCase())}</span>`;
          }
          const label = t.head[i] ? plainTextOf(t.head[i]!).trim() : "";
          const html = renderInline(cell, ctx);
          return label
            ? `<span class="risk-field"><span class="risk-field-label">${escapeHtml(label)}</span>${html}</span>`
            : `<span class="risk-field">${html}</span>`;
        })
        .join("");
      const cls = severity ? `risk-card risk-${severity}` : "risk-card";
      return `<div class="${cls}">${fields}</div>`;
    })
    .join("");
  return `<div class="risk-cards">${cards}</div>`;
}

// A rail is a raw key: value block, like tiles, but rendered as a standalone sticky side
// panel rather than inline content - see render/index.ts, which pulls the first top-level
// :::rail directive out of the body before the ordinary block pass reaches it.
export function extractRail(body: Block[]): { rail: DirectiveNode | null; rest: Block[] } {
  const idx = body.findIndex((b) => b.type === "directive" && b.known && b.name === "rail");
  if (idx === -1) return { rail: null, rest: body };
  const rail = body[idx] as DirectiveNode;
  const rest = [...body.slice(0, idx), ...body.slice(idx + 1)];
  return { rail, rest };
}

// Values may hold a markdown link and/or a badge; nothing else. `[text](url)` first, then
// `:badge[label]{tone=x}` inside whatever text is left, same tones as the inline badge syntax.
const RAIL_LINK_RE = /\[([^\]]*)\]\(([^)]*)\)/g;
const RAIL_BADGE_RE = /:badge\[([^\]]*)\](?:\{([^}]*)\})?/g;
const RAIL_BADGE_TONES = new Set(["good", "warn", "bad", "info", "neutral"]);

function renderRailBadges(text: string): string {
  if (!text.includes(":badge[")) return escapeHtml(text);
  let out = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  RAIL_BADGE_RE.lastIndex = 0;
  while ((m = RAIL_BADGE_RE.exec(text))) {
    out += escapeHtml(text.slice(lastIndex, m.index));
    const toneMatch = m[2] ? /tone\s*=\s*([a-zA-Z]+)/.exec(m[2]) : null;
    const requested = toneMatch ? toneMatch[1]!.toLowerCase() : "neutral";
    const tone = RAIL_BADGE_TONES.has(requested) ? requested : "neutral";
    out += `<span class="badge badge-${tone}">${escapeHtml(m[1] ?? "")}</span>`;
    lastIndex = m.index + m[0].length;
  }
  out += escapeHtml(text.slice(lastIndex));
  return out;
}

function renderRailValue(value: string): string {
  let out = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  RAIL_LINK_RE.lastIndex = 0;
  while ((m = RAIL_LINK_RE.exec(value))) {
    out += renderRailBadges(value.slice(lastIndex, m.index));
    const href = m[2] ?? "";
    out += `<a href="${escapeAttr(href)}" rel="noopener noreferrer">${escapeHtml(m[1] ?? "")}</a>`;
    lastIndex = m.index + m[0].length;
  }
  out += renderRailBadges(value.slice(lastIndex));
  return out;
}

function renderRail(n: DirectiveNode): string {
  const rows = (n.raw ?? [])
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return "";
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!key) return "";
      return `<dt class="rail-key">${escapeHtml(key)}</dt><dd class="rail-value">${renderRailValue(value)}</dd>`;
    })
    .filter(Boolean)
    .join("");
  return `<aside class="rail" aria-label="Summary"><dl class="rail-list">${rows}</dl></aside>`;
}

// A label line plus content hidden behind a button: <details>/<summary> so it still works with
// scripts off, and print already forces every collapsed <details> open (see theme.ts).
function renderReveal(n: DirectiveNode, ctx: Ctx): string {
  const label = n.args.length ? n.args.join(" ") : "Show more";
  const body = renderBlocks(n.children, ctx);
  return `<details class="reveal"><summary>${escapeHtml(label)}</summary><div class="reveal-body">${body}</div></details>`;
}

const CHECK_TONES: Record<string, string> = { met: "good", partial: "warn", "not-met": "bad", "n/a": "neutral" };
const CHECK_LABELS: Record<string, string> = { met: "Met", partial: "Partial", "not-met": "Not met", "n/a": "N/A" };

// Lines of "status | item | evidence"; status maps to the same badge tones the inline
// `:badge` syntax already uses (met=good, partial=warn, not-met=bad, n/a=neutral).
function renderChecks(n: DirectiveNode): string {
  const rows = (n.raw ?? [])
    .map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      const status = parts[0]?.toLowerCase();
      const item = parts[1];
      const evidence = parts[2] ?? "";
      if (!status || !item) return "";
      const tone = CHECK_TONES[status] ?? "neutral";
      const label = CHECK_LABELS[status] ?? parts[0]!;
      return (
        `<tr><td><span class="badge badge-${tone}">${escapeHtml(label)}</span></td>` +
        `<td>${escapeHtml(item)}</td><td>${escapeHtml(evidence)}</td></tr>`
      );
    })
    .filter(Boolean)
    .join("");
  return `<table class="checks"><thead><tr><th>Status</th><th>Item</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// One "date | text" line per entry, oldest first, rendered as a vertical list.
function renderTimeline(n: DirectiveNode): string {
  const items = (n.raw ?? [])
    .map((line) => {
      const idx = line.indexOf("|");
      if (idx === -1) return "";
      const date = line.slice(0, idx).trim();
      const body = line.slice(idx + 1).trim();
      if (!date && !body) return "";
      return `<li class="timeline-item"><time class="timeline-date">${escapeHtml(date)}</time><div class="timeline-text">${escapeHtml(body)}</div></li>`;
    })
    .filter(Boolean)
    .join("");
  return `<ol class="timeline">${items}</ol>`;
}

// Block form, not inline `:progress[...]`: inline badge syntax lives in render/inline.ts, a
// file this lane does not own, so the new syntax stays in the directive layer it does own.
// First arg is "done/total", the rest is the label: ":::progress 7/12 Rollout complete".
function renderProgress(n: DirectiveNode): string {
  const frac = n.args[0] ?? "0/1";
  const m = /^(\d+)\/(\d+)$/.exec(frac);
  const value = m ? Number(m[1]) : 0;
  const max = m && Number(m[2]) > 0 ? Number(m[2]) : 1;
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  const label = n.args.slice(1).join(" ") || `${value}/${max}`;
  return (
    `<div class="progress" role="progressbar" aria-valuenow="${value}" aria-valuemin="0" ` +
    `aria-valuemax="${max}" aria-label="${escapeAttr(label)}">` +
    `<div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>` +
    `<span class="progress-label">${escapeHtml(label)} (${value}/${max})</span></div>`
  );
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
