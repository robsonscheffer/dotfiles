// One renderer for a claim's evidence, shared by the paragraph evidence line, the Claims list at
// the end of the page, and (through a script-side copy) the click panel.

import type { Ctx } from "./ctx.ts";
import { excerptFor, sourceLinkFor } from "./inline.ts";
import { escapeAttr, escapeHtml } from "./util.ts";

export interface ClaimRowOptions {
  // "list" adds the anchor id a marker links to and the ledger-miss wording of the Claims list.
  variant?: "line" | "list";
}

function inlineCode(escaped: string): string {
  return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function renderClaimRow(id: string, ctx: Ctx, opts: ClaimRowOptions = {}): string {
  const list = opts.variant === "list";
  const idAttr = list ? ` id="claim-${escapeAttr(id)}"` : "";
  const claim = ctx.ledger?.claims.find((c) => c.id === id);
  if (!claim) {
    const msg = list ? `${escapeHtml(id)} is not in the ledger` : `Missing claim ${escapeHtml(id)}`;
    return `<div class="claim-evidence claim-evidence-missing${list ? " claim-row" : ""}"${idAttr}>${msg}</div>`;
  }
  const excerpt = claim.evidence ? excerptFor(claim.evidence) : "";
  const source = claim.evidence ? sourceLinkFor(claim.evidence) : "";
  const date = claim.checked_at ?? "";
  return (
    `<div class="claim-evidence${list ? " claim-row" : ""}"${idAttr}>` +
    `<span class="claim-id">${escapeHtml(claim.id)}</span>` +
    `<span class="claim-text">${inlineCode(escapeHtml(claim.claim))}</span>` +
    `<span class="claim-status claim-status-${escapeAttr(claim.status)}">${escapeHtml(claim.status)}</span>` +
    (claim.verdict
      ? `<span class="verdict-badge verdict-${escapeAttr(claim.verdict)}">${escapeHtml(claim.verdict)}</span>`
      : "") +
    (claim.verdict_reason ? `<span class="claim-reason">${escapeHtml(claim.verdict_reason)}</span>` : "") +
    (claim.checked_by ? `<span class="claim-checked-by">${escapeHtml(claim.checked_by)}</span>` : "") +
    (date ? `<time class="claim-date">${escapeHtml(date)}</time>` : "") +
    (excerpt ? `<code class="claim-excerpt">${escapeHtml(excerpt)}</code>` : "") +
    source +
    (claim.status === "not_verified"
      ? `<span class="claim-owner">Owner: ${escapeHtml(claim.owner ?? "unassigned")}</span>`
      : "") +
    `</div>`
  );
}

export function renderClaimsList(ids: string[], ctx: Ctx): string {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push(renderClaimRow(id, ctx, { variant: "list" }));
  }
  if (rows.length === 0) return "";
  return `<section class="claims-list" id="mate-doc-claims"><h2>Claims</h2>\n${rows.join("\n")}\n</section>`;
}

// Opens one shared dialog next to the marker on plain click or Enter. Modifier-clicks keep the
// normal link behaviour, so without the script (or with Cmd-click) the marker still jumps to the row.
export const CLAIM_PANEL_SCRIPT = `(function(){
  var panel = null, current = null;
  function close() {
    if (!panel) return;
    var m = current;
    panel.remove(); panel = null; current = null;
    if (m) m.focus();
  }
  function open(marker) {
    var id = marker.getAttribute('href').slice(1);
    var row = document.getElementById(id);
    if (!row) return;
    close();
    panel = document.createElement('div');
    panel.className = 'claim-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', marker.getAttribute('aria-label') || 'Claim');
    panel.tabIndex = -1;
    var body = row.cloneNode(true);
    body.removeAttribute('id');
    body.classList.remove('claim-row');
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'claim-panel-close';
    btn.setAttribute('aria-label', 'Close claim'); btn.textContent = 'Close';
    btn.addEventListener('click', close);
    var more = document.createElement('a');
    more.className = 'claim-panel-more'; more.href = '#' + id;
    more.textContent = 'Show in Claims list';
    more.addEventListener('click', function () { panel.remove(); panel = null; current = null; });
    panel.appendChild(btn); panel.appendChild(body); panel.appendChild(more);
    var host = marker.closest('sup') || marker;
    host.parentNode.insertBefore(panel, host.nextSibling);
    current = marker;
    panel.focus();
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    var marker = t.closest ? t.closest('a.claim-marker') : null;
    if (marker) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      open(marker);
      return;
    }
    if (panel && !panel.contains(t)) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel) close();
  });
})();`;
