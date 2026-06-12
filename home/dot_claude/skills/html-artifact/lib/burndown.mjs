import { readFileSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";
import matter from "gray-matter";

const STATUSES = ["open", "ready", "building", "done", "dropped"];
const STATUS_BADGE = {
  open: "badge-soft badge-open",
  ready: "badge-soft badge-ready",
  building: "badge-soft badge-building",
  done: "badge-soft badge-done",
  dropped: "badge-soft badge-dropped",
};

export function scanTickets(repoRoot, prefix) {
  const tickets = [];
  for (const bucket of ["active", "done"]) {
    const dir = join(repoRoot, "docs", "plans", bucket);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const m = name.match(new RegExp(`^(${prefix}-\\d+)(?:-([a-z0-9-]+))?$`));
      if (!m) continue;
      const readme = join(dir, name, "README.md");
      if (!existsSync(readme)) continue;
      const id = m[1];
      const slug = m[2] || "";
      const number = Number(id.split("-")[1]);
      const raw = readFileSync(readme, "utf8");
      const { data } = matter(raw);
      const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
      const phaseTag = tags.find((t) => /^phase-\d+$/.test(t));
      const phase = phaseTag ? Number(phaseTag.replace("phase-", "")) : null;
      const title = deriveTicketTitle(raw, slug);
      tickets.push({
        id,
        number,
        slug,
        bucket,
        path: readme,
        status: String(data.status || "open"),
        needs: String(data.needs || ""),
        tags,
        phase,
        depends: Array.isArray(data.depends) ? data.depends.map(String) : [],
        title,
      });
    }
  }
  tickets.sort((a, b) => a.number - b.number);
  return tickets;
}

function deriveTicketTitle(raw, slug) {
  const body = raw.replace(/^---[\s\S]*?---\s*/, "");
  const whatMatch = body.match(/##\s*What\s*\n+([^\n]+)/i);
  if (whatMatch) {
    const firstLine = whatMatch[1].trim();
    if (firstLine.length > 0 && firstLine.length <= 90) return firstLine;
  }
  return slug.replace(/-/g, " ");
}

export function parseEpicPhases(epicPath) {
  if (!existsSync(epicPath)) return {};
  const raw = readFileSync(epicPath, "utf8");
  const phases = {};
  const re = /^##\s+Phase\s+(\d+)\s*[·.\-]\s*(.+?)\s*$/gim;
  let m;
  while ((m = re.exec(raw)) !== null) {
    phases[Number(m[1])] = m[2].trim();
  }
  return phases;
}

export function computeStats(tickets) {
  const stats = {
    total: tickets.length,
    open: 0,
    ready: 0,
    building: 0,
    done: 0,
    dropped: 0,
  };
  for (const t of tickets) {
    if (Object.prototype.hasOwnProperty.call(stats, t.status))
      stats[t.status]++;
  }
  const live = stats.total - stats.dropped;
  stats.progressPct = live > 0 ? Math.round((stats.done / live) * 100) : 0;
  return stats;
}

export function groupByPhase(tickets) {
  const byPhase = new Map();
  for (const t of tickets) {
    const key = t.phase === null ? "unphased" : t.phase;
    if (!byPhase.has(key)) byPhase.set(key, []);
    byPhase.get(key).push(t);
  }
  const sortedKeys = [...byPhase.keys()].sort((a, b) => {
    if (a === "unphased") return 1;
    if (b === "unphased") return -1;
    return a - b;
  });
  return sortedKeys.map((k) => ({ phase: k, tickets: byPhase.get(k) }));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadge(status) {
  const cls = STATUS_BADGE[status] || "badge-soft badge-open";
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

function ticketRow(t) {
  const href = `/md?path=${encodeURIComponent(t.path)}`;
  const depends =
    t.depends.length > 0
      ? t.depends.map((d) => d.replace(/^[A-Z]+-0*/, "")).join(", ")
      : "—";
  return `          <tr>
            <td style="font-family:var(--mate-font-mono);"><a href="${href}" style="color:var(--mate-primary);text-decoration:none">${escapeHtml(t.id)}</a></td>
            <td style="color:var(--mate-frame-text)">${escapeHtml(t.title)}</td>
            <td>${statusBadge(t.status)}</td>
            <td style="font-family:var(--mate-font-mono);color:var(--mate-frame-text)">${escapeHtml(t.needs || "—")}</td>
            <td style="font-family:var(--mate-font-mono);color:var(--mate-frame-muted)">${escapeHtml(depends)}</td>
          </tr>`;
}

function phaseCardHtml(phaseKey, title, group) {
  const total = group.length;
  const done = group.filter((t) => t.status === "done").length;
  const building = group.filter((t) => t.status === "building").length;
  const open = group.filter(
    (t) => t.status === "open" || t.status === "ready",
  ).length;
  const headline =
    building > 0
      ? `${building} building · ${open} open`
      : done === total && total > 0
        ? "complete"
        : `${done} done · ${open} open`;
  const progressClass =
    done === total && total > 0
      ? "progress-success"
      : building > 0
        ? "progress-warning"
        : "progress";
  return `        <div style="background:var(--mate-frame-sidebar);border:1px solid var(--mate-frame-border);border-radius:8px;padding:16px;">
          <div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--mate-frame-muted);font-family:var(--mate-font-body);margin-bottom:6px;">${escapeHtml(title)}</div>
          <div style="font-family:var(--mate-font-display);font-size:26px;font-weight:600;color:var(--mate-frame-text);line-height:1;margin-bottom:4px;">${done} / ${total}</div>
          <progress class="progress ${progressClass}" value="${done}" max="${total}" style="width:100%;height:6px"></progress>
          <div style="font-family:var(--mate-font-mono);font-size:14px;color:var(--mate-frame-muted);margin-top:6px;">${escapeHtml(headline)}</div>
        </div>`;
}

function phaseTableHtml(title, tickets) {
  return `      <h2 style="font-family:var(--mate-font-display);font-size:26px;font-weight:600;color:var(--mate-frame-text);margin:24px 0 14px;">${escapeHtml(title)}</h2>
      <table class="table w-full" style="margin:0 0 28px">
        <thead>
          <tr>
            <th style="color:var(--mate-frame-muted);font-family:var(--mate-font-body)">ID</th>
            <th style="color:var(--mate-frame-muted);font-family:var(--mate-font-body)">Title</th>
            <th style="color:var(--mate-frame-muted);font-family:var(--mate-font-body)">Status</th>
            <th style="color:var(--mate-frame-muted);font-family:var(--mate-font-body)">Needs</th>
            <th style="color:var(--mate-frame-muted);font-family:var(--mate-font-body)">Depends</th>
          </tr>
        </thead>
        <tbody>
${tickets.map(ticketRow).join("\n")}
        </tbody>
      </table>`;
}

export function renderBurndown({
  templatePath,
  epicTitle,
  epicSlug,
  epicPath,
  generatedDate,
  tickets,
  phaseTitles,
}) {
  const template = readFileSync(templatePath, "utf8");
  const stats = computeStats(tickets);
  const groups = groupByPhase(tickets);

  const overallState =
    stats.building > 0
      ? "building"
      : stats.done === stats.total && stats.total > 0
        ? "done"
        : "open";

  const epicHref = epicPath ? `/md?path=${encodeURIComponent(epicPath)}` : "#";
  const meta = `<span class="badge badge-ghost">dashboard</span>
        <span>${escapeHtml(generatedDate)}</span>
        <span class="badge badge-soft badge-${overallState}">${escapeHtml(overallState)}</span>
        <a href="${epicHref}" style="color:var(--mate-primary);text-decoration:none;font-family:var(--mate-font-mono);font-size:14px;">epic: ${escapeHtml(epicSlug)}</a>`;

  const cards = groups
    .map(({ phase, tickets: g }) => {
      const title =
        phase === "unphased"
          ? "Unphased"
          : `Phase ${phase} · ${phaseTitles[phase] || ""}`.trim();
      return phaseCardHtml(phase, title, g);
    })
    .join("\n");

  const tables = groups
    .map(({ phase, tickets: g }) => {
      const title =
        phase === "unphased"
          ? "Unphased"
          : `Phase ${phase} · ${phaseTitles[phase] || ""}`.trim();
      return phaseTableHtml(title, g);
    })
    .join("\n");

  return template
    .replace(/<!-- EPIC_TITLE -->/g, escapeHtml(epicTitle))
    .replace("<!-- META -->", meta)
    .replace("<!-- STAT_TOTAL -->", String(stats.total))
    .replace("<!-- STAT_DONE -->", String(stats.done))
    .replace("<!-- STAT_BUILDING -->", String(stats.building))
    .replace("<!-- STAT_OPEN -->", String(stats.open + stats.ready))
    .replace("<!-- STAT_PROGRESS -->", `${stats.progressPct}%`)
    .replace("<!-- PROGRESS_VALUE -->", String(stats.done))
    .replace("<!-- PROGRESS_MAX -->", String(stats.total))
    .replace("<!-- PHASE_CARDS -->", cards)
    .replace("<!-- PHASE_TABLES -->", tables);
}
