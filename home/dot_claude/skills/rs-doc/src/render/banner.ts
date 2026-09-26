import type { Banner } from "../types.ts";
import { escapeHtml } from "./util.ts";

const LEVEL_LABEL: Record<Banner["level"], string> = {
  draft: "Draft",
  audited: "Audited",
  official: "Official",
};

export function renderBanner(b: Banner): string {
  const parts = [LEVEL_LABEL[b.level]];
  if (b.approvedAt) parts.push(`approved ${b.approvedAt}`);
  parts.push(`${b.claims} claim${b.claims === 1 ? "" : "s"} checked`);
  parts.push(`${b.open} open`);
  parts.push(b.fresh ? "fresh" : "stale");
  return `<div class="status-banner status-${b.level}">${parts.map((p) => escapeHtml(p)).join(" &middot; ")}</div>`;
}
