import { escapeHtml } from "./util.ts";

export interface FlowEdge {
  from: string;
  to: string;
  label: string;
}

export interface FlowNodeRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlowLabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

export interface FlowLayout {
  nodes: FlowNodeRect[];
  labels: FlowLabelBox[];
  edges: { from: string; to: string; path: string; label: string }[];
  width: number;
  height: number;
}

const EDGE_RE = /^\s*(.+?)\s*->\s*(.+?)\s*(?::\s*(.*))?$/;

export function parseFlowLine(line: string): FlowEdge | null {
  const m = EDGE_RE.exec(line);
  if (!m) return null;
  return { from: m[1]!, to: m[2]!, label: m[3] ?? "" };
}

const BOX_WIDTH = 140;
const BOX_HEIGHT = 48;
const GAP_X = 90;
const GAP_Y = 28;
const MARGIN_X = 24;
const MARGIN_Y = 24;
const LABEL_HEIGHT = 16;
const CHAR_WIDTH = 6.5;

// Layered layout: column = longest path from a source node, row = order of first appearance
// within that column. Every (column, row) cell holds at most one node, so any edge or label
// that stays within its own column's gap on the x-axis can never cross a node rect, even when
// a node has two or more outgoing edges landing on different rows.
function computeColumns(nodeOrder: string[], edges: FlowEdge[]): Map<string, number> {
  const col = new Map<string, number>();
  for (const n of nodeOrder) col.set(n, 0);
  for (let i = 0; i < nodeOrder.length; i++) {
    let changed = false;
    for (const e of edges) {
      const cu = col.get(e.from) ?? 0;
      const cv = col.get(e.to) ?? 0;
      if (cv < cu + 1) {
        col.set(e.to, cu + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return col;
}

function computeRows(nodeOrder: string[], col: Map<string, number>): Map<string, number> {
  const row = new Map<string, number>();
  const counts = new Map<number, number>();
  for (const n of nodeOrder) {
    const c = col.get(n)!;
    const r = counts.get(c) ?? 0;
    row.set(n, r);
    counts.set(c, r + 1);
  }
  return row;
}

function labelBox(centerX: number, centerY: number, text: string, maxWidth: number): FlowLabelBox {
  const rawWidth = text.length * CHAR_WIDTH + 8;
  const width = Math.max(20, Math.min(rawWidth, Math.max(20, maxWidth)));
  return { x: centerX - width / 2, y: centerY - LABEL_HEIGHT / 2, width, height: LABEL_HEIGHT, text };
}

export function computeFlowLayout(lines: string[]): FlowLayout {
  const edges = lines.map(parseFlowLine).filter((e): e is FlowEdge => e !== null);
  if (edges.length === 0) {
    return { nodes: [], labels: [], edges: [], width: 0, height: 0 };
  }

  const nodeOrder: string[] = [];
  for (const e of edges) {
    if (!nodeOrder.includes(e.from)) nodeOrder.push(e.from);
    if (!nodeOrder.includes(e.to)) nodeOrder.push(e.to);
  }

  const col = computeColumns(nodeOrder, edges);
  const row = computeRows(nodeOrder, col);

  const pos = new Map<string, { x: number; y: number }>();
  for (const n of nodeOrder) {
    pos.set(n, {
      x: MARGIN_X + col.get(n)! * (BOX_WIDTH + GAP_X),
      y: MARGIN_Y + row.get(n)! * (BOX_HEIGHT + GAP_Y),
    });
  }

  const maxCol = Math.max(...[...col.values()]);
  const maxRow = Math.max(...[...row.values()]);
  const width = MARGIN_X * 2 + (maxCol + 1) * BOX_WIDTH + maxCol * GAP_X;
  const height = MARGIN_Y * 2 + (maxRow + 1) * BOX_HEIGHT + maxRow * GAP_Y;

  const nodes: FlowNodeRect[] = nodeOrder.map((n) => ({ id: n, ...pos.get(n)!, width: BOX_WIDTH, height: BOX_HEIGHT }));

  const labels: FlowLabelBox[] = [];
  const edgePaths: FlowLayout["edges"] = [];

  for (const e of edges) {
    const fromPos = pos.get(e.from)!;
    const toPos = pos.get(e.to)!;
    const x1 = fromPos.x + BOX_WIDTH;
    const y1 = fromPos.y + BOX_HEIGHT / 2;
    const x2 = toPos.x;
    const y2 = toPos.y + BOX_HEIGHT / 2;

    let path: string;
    if (row.get(e.from) === row.get(e.to)) {
      path = `M ${x1} ${y1} L ${x2 - 6} ${y2}`;
      if (e.label) labels.push(labelBox((x1 + x2) / 2, y1 - 10 - LABEL_HEIGHT / 2, e.label, x2 - x1 - 8));
    } else {
      // Elbow routing: the turn happens inside the gap right after the source column, which
      // is empty space in every row, so neither the vertical run nor the label can land on top
      // of a node rect regardless of how far apart the rows are.
      const turnX = x1 + GAP_X / 2;
      path = `M ${x1} ${y1} L ${turnX} ${y1} L ${turnX} ${y2} L ${x2 - 6} ${y2}`;
      if (e.label) labels.push(labelBox(turnX, (y1 + y2) / 2, e.label, GAP_X - 8));
    }
    edgePaths.push({ from: e.from, to: e.to, path, label: e.label });
  }

  return { nodes, labels, edges: edgePaths, width, height };
}

export function renderFlowLayout(layout: FlowLayout): string {
  if (layout.nodes.length === 0) {
    return `<div class="flow-empty">No flow steps.</div>`;
  }

  const boxes = layout.nodes
    .map(
      (n) =>
        `<g class="flow-node">` +
        `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="6" ` +
        `fill="var(--flow-fill)" stroke="currentColor" stroke-width="1.5"/>` +
        `<text x="${n.x + n.width / 2}" y="${n.y + n.height / 2}" text-anchor="middle" ` +
        `dominant-baseline="middle" fill="currentColor" font-size="13">${escapeHtml(n.id)}</text>` +
        `</g>`,
    )
    .join("");

  const arrows = layout.edges
    .map((e) => `<g class="flow-edge"><path d="${e.path}" fill="none" stroke="currentColor" stroke-width="1.5" marker-end="url(#flow-arrowhead)"/></g>`)
    .join("");

  const labels = layout.labels
    .map(
      (l) =>
        `<g class="flow-label">` +
        `<rect x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" fill="var(--bg)"/>` +
        `<text x="${l.x + l.width / 2}" y="${l.y + l.height / 2}" text-anchor="middle" ` +
        `dominant-baseline="middle" fill="currentColor" font-size="11">${escapeHtml(l.text)}</text>` +
        `</g>`,
    )
    .join("");

  return (
    `<svg class="flow-diagram" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" ` +
    `role="img" aria-label="flow diagram">` +
    `<defs><marker id="flow-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">` +
    `<path d="M0,0 L8,4 L0,8 Z" fill="currentColor"/></marker></defs>` +
    `${boxes}${arrows}${labels}</svg>`
  );
}

export function buildFlowSvg(lines: string[]): string {
  return renderFlowLayout(computeFlowLayout(lines));
}
