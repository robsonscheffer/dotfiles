import { escapeHtml } from "./util.ts";

export interface FlowEdge {
  from: string;
  to: string;
  label: string;
}

const EDGE_RE = /^\s*(.+?)\s*->\s*(.+?)\s*(?::\s*(.*))?$/;

export function parseFlowLine(line: string): FlowEdge | null {
  const m = EDGE_RE.exec(line);
  if (!m) return null;
  return { from: m[1]!, to: m[2]!, label: m[3] ?? "" };
}

// Theme-aware SVG: only `currentColor` and CSS custom properties, never a literal hex color,
// so the diagram follows light/dark like the rest of the page.
export function buildFlowSvg(lines: string[]): string {
  const edges = lines.map(parseFlowLine).filter((e): e is FlowEdge => e !== null);
  if (edges.length === 0) {
    return `<div class="flow-empty">No flow steps.</div>`;
  }

  const nodeOrder: string[] = [];
  for (const e of edges) {
    if (!nodeOrder.includes(e.from)) nodeOrder.push(e.from);
    if (!nodeOrder.includes(e.to)) nodeOrder.push(e.to);
  }

  const boxWidth = 140;
  const boxHeight = 48;
  const gapX = 80;
  const marginX = 20;
  const marginY = 30;
  const y = marginY;

  const positions = new Map<string, number>();
  nodeOrder.forEach((n, i) => positions.set(n, marginX + i * (boxWidth + gapX)));

  const width = marginX * 2 + nodeOrder.length * boxWidth + Math.max(0, nodeOrder.length - 1) * gapX;
  const height = marginY * 2 + boxHeight + 24;

  const boxes = nodeOrder
    .map((n) => {
      const x = positions.get(n)!;
      return (
        `<g class="flow-node">` +
        `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="6" ` +
        `fill="var(--flow-fill)" stroke="currentColor" stroke-width="1.5"/>` +
        `<text x="${x + boxWidth / 2}" y="${y + boxHeight / 2}" text-anchor="middle" ` +
        `dominant-baseline="middle" fill="currentColor" font-size="13">${escapeHtml(n)}</text>` +
        `</g>`
      );
    })
    .join("");

  const arrows = edges
    .map((e) => {
      const x1 = positions.get(e.from)! + boxWidth;
      const x2 = positions.get(e.to)!;
      const midY = y + boxHeight / 2;
      const labelY = midY - 8;
      const label = e.label
        ? `<text x="${(x1 + x2) / 2}" y="${labelY}" text-anchor="middle" fill="currentColor" font-size="11">${escapeHtml(e.label)}</text>`
        : "";
      return (
        `<g class="flow-edge">` +
        `<line x1="${x1}" y1="${midY}" x2="${x2 - 6}" y2="${midY}" stroke="currentColor" ` +
        `stroke-width="1.5" marker-end="url(#flow-arrowhead)"/>${label}</g>`
      );
    })
    .join("");

  return (
    `<svg class="flow-diagram" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
    `role="img" aria-label="flow diagram">` +
    `<defs><marker id="flow-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">` +
    `<path d="M0,0 L8,4 L0,8 Z" fill="currentColor"/></marker></defs>` +
    `${boxes}${arrows}</svg>`
  );
}
