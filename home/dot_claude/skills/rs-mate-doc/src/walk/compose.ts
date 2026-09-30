// Composes a walk folder (index.md + claims.yaml) from a fetched PR plus the agent outputs
// (WalkInputs). This is mate-doc's port of rs-walk's bin/build-walk.py: same section order and
// the same "each diff/ticket statement gets a claim" discipline, but written as markdown-plus-
// ledger instead of a standalone HTML document, and rendered later by mate-doc's own renderer.
import type { Claim, ClaimId } from "../types.ts";
import { findAnchorLine, renderDiffFence } from "./diff.ts";
import type { AcceptanceCriterion, ComposedWalk, ContextData, FetchedPr, JudgmentData, QuestionItem, RiskItem, StoryData, StoryGroup, TicketFit, WalkAnchor, WalkInputs } from "./types.ts";

const MAX_DIFF_LINES = 80;
const CODE_REF_TTL_DAYS = 14;
const TICKET_TAG_RE = /[A-Z]+-\d+/g;
const BOLD_RE = /\*\*(.+?)\*\*/g;

interface ClaimBuild {
  claims: Claim[];
  nextId: number;
  warnings: string[];
}

function nextClaimId(build: ClaimBuild): ClaimId {
  const id = `C${build.nextId}` as ClaimId;
  build.nextId += 1;
  return id;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Raw <details> content is never re-parsed by markdown-it, so **bold** has to be converted by
// hand here - escape first (same order as rs-walk's render_prose), then let the surviving
// ** markers become <strong>.
function renderProseHtml(s: string): string {
  return escapeHtmlText(s).replace(BOLD_RE, "<strong>$1</strong>");
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function extractTicketTags(title: string, ticketKey: string | undefined): string[] {
  const found = title.match(TICKET_TAG_RE) ?? [];
  const tags = Array.from(new Set(found));
  if (ticketKey && !tags.includes(ticketKey)) tags.push(ticketKey);
  return tags;
}

// `kind: walk`, `pr`, and `verdict` are the home index's fields (src/index/collect.ts): kind
// picks the entry's filter bucket, pr labels it, verdict stays empty until the walk closes.
function renderFrontmatter(pr: FetchedPr, inputs: WalkInputs, updated: string): string {
  const tags = extractTicketTags(pr.meta.title, inputs.ticketFit?.ticket_key);
  const lines = [
    "---",
    `title: ${yamlString(`#${pr.meta.number}: ${pr.meta.title}`)}`,
    "shape: walk",
    "kind: walk",
    "status: draft",
    "notes: true",
    `summary: ${yamlString(inputs.story.lead ?? pr.meta.title)}`,
  ];
  if (tags.length > 0) lines.push(`tags: [${tags.map(yamlString).join(", ")}]`);
  lines.push(`sources: [${yamlString(pr.meta.url)}]`);
  lines.push(`pr: ${yamlString(`${pr.repo}#${pr.meta.number}`)}`);
  lines.push('verdict: ""');
  lines.push(`updated: ${updated}`);
  lines.push("---");
  return lines.join("\n");
}

// The sticky rail panel (WRN lane, render/directives.ts's :::rail): a compact PR summary that
// stays visible while scrolling, separate from the fuller header prose below it.
function renderRailSection(pr: FetchedPr, inputs: WalkInputs, ticketFit: TicketFit | undefined): string {
  const m = pr.meta;
  const lines = [
    ":::rail",
    `Author: ${m.author.login}`,
    `PR: [#${m.number}](${m.url})`,
    `Branch: ${m.headRefName}`,
  ];
  if (ticketFit) lines.push(`Ticket: ${ticketFit.ticket_key}`);
  lines.push(`Comments: ${inputs.commentTriage?.length ?? 0}`);
  lines.push(`Risks: ${inputs.risks.length}`);
  lines.push(":::");
  return lines.join("\n");
}

function renderHeader(pr: FetchedPr): string {
  const m = pr.meta;
  return [
    `# #${m.number}: ${m.title}`,
    "",
    `Repo: ${pr.repo}`,
    `Author: ${m.author.login}`,
    `Branch: ${m.headRefName} into ${m.baseRefName}`,
    `Changes: +${m.additions} / -${m.deletions} across ${m.changedFiles} files`,
    `[View on GitHub](${m.url})`,
  ].join("\n");
}

function renderStorySection(story: StoryData): string {
  const lines = ["## The story", ""];
  if (story.lead) lines.push(`**${story.lead}**`, "");
  for (const beat of story.story) lines.push(beat, "");
  return lines.join("\n").trimEnd();
}

// Returns the code evidence for the first anchor the diff can locate, or undefined. The agent
// picks the line; compose only finds it. An added line only exists at head, a removed line only
// at base. Every later anchor is checked too, so the agent learns which ones were not used.
function findAnchorEvidence(pr: FetchedPr, anchors: WalkAnchor[], where: string, noun: string, warnings: string[]): Claim["evidence"] | undefined {
  let evidence: Claim["evidence"] | undefined;
  anchors.forEach((anchor, i) => {
    const change = findAnchorLine(pr.diff, anchor.file, anchor.excerpt);
    const located = change.found && !!change.excerpt;
    if (evidence) {
      const why = located ? `not used; one claim uses one ${noun}, split the framing to back more lines` : "did not match the diff";
      warnings.push(`${where}: ${noun} ${i + 1} (${anchor.file}) ${why}`);
      return;
    }
    if (!located || !change.excerpt) return;
    const sha = change.side === "removed" ? pr.meta.baseRefOid : pr.meta.headRefOid;
    evidence = { kind: "code", ref: `${pr.repo}@${sha}:${anchor.file}:${change.line ?? 1}`, excerpt: change.excerpt, needs: "gh" };
  });
  return evidence;
}

// Compose only proposes: a claim with a located anchor is `proposed`, anything else is
// `not_verified` with the PR author as owner. A verifier or a person settles it later.
function buildProposedClaim(pr: FetchedPr, id: ClaimId, text: string, anchors: WalkAnchor[], where: string, noun: string, warnings: string[]): Claim {
  const evidence = findAnchorEvidence(pr, anchors, where, noun, warnings);
  if (!evidence) return { id, claim: text, status: "not_verified", owner: pr.meta.author.login };
  return { id, claim: text, status: "proposed", evidence, ttl_days: CODE_REF_TTL_DAYS };
}

// One claim per group that has a framing statement. Reading directions belong in the group lead,
// which is never a claim, so a group without framing gets no claim and no marker.
function buildGroupClaim(pr: FetchedPr, group: StoryGroup, index: number, build: ClaimBuild): ClaimId | undefined {
  if (!group.framing) return undefined;
  const id = nextClaimId(build);
  const anchors = (group.anchors ?? []).filter((a) => group.files.includes(a.file));
  const where = `group ${String(index).padStart(2, "0")} "${group.title}"`;
  const claim = buildProposedClaim(pr, id, group.framing, anchors, where, "anchor", build.warnings);
  if (claim.status === "not_verified") {
    build.warnings.push(`${where}: no anchor matched the diff; claim ${id} is not_verified`);
  }
  build.claims.push(claim);
  return id;
}

function renderGroupSection(group: StoryGroup, index: number, claimId: ClaimId | undefined, diff: string): string {
  const lines = [`## ${String(index).padStart(2, "0")}. ${group.title}`, ""];
  if (group.lead) lines.push(`**${group.lead}**`, "");
  if (group.framing && claimId) lines.push(`${group.framing} {${claimId}}`, "");
  if (group.note) lines.push(":::note", group.note, ":::", "");
  for (const file of group.files) lines.push(renderDiffFence(file, diff, MAX_DIFF_LINES), "");
  return lines.join("\n").trimEnd();
}

// One claim per acceptance criterion - "what the ticket asks," per the brief. Verified only
// when the agent output carried non-empty evidence text for that criterion; otherwise
// not_verified with the PR author as owner, same rule as the diff claims above.
function renderTicketFitSection(pr: FetchedPr, ticketFit: TicketFit | undefined, build: ClaimBuild): string {
  if (!ticketFit) {
    return ["## Ticket fit", "", "No ticket linked to this PR."].join("\n");
  }
  const lines = [`## Ticket fit: ${ticketFit.ticket_key}`, ""];
  lines.push(":::note", `Ticket quality: ${ticketFit.ticket_quality.score}. ${ticketFit.ticket_quality.notes}`, ":::", "");

  if (ticketFit.acceptance_criteria.length > 0) {
    lines.push("| Criterion | Status | Evidence |", "|---|---|---|");
    for (const ac of ticketFit.acceptance_criteria) {
      const id = buildAcClaim(pr, ac, build);
      lines.push(`| ${escapeTableCell(ac.criterion)} {${id}} | ${ac.status} | ${escapeTableCell(ac.evidence)} |`);
    }
    lines.push("");
  } else {
    lines.push("No acceptance criteria on the ticket.", "");
  }

  if (ticketFit.scope_delta) lines.push(`Scope delta: ${ticketFit.scope_delta}`, "");
  return lines.join("\n").trimEnd();
}

function buildAcClaim(pr: FetchedPr, ac: AcceptanceCriterion, build: ClaimBuild): ClaimId {
  const id = nextClaimId(build);
  const text = ac.criterion;
  const refs = ac.refs ?? [];
  const claim: Claim = ac.status === "Met" ? buildProposedClaim(pr, id, text, refs, `criterion "${ac.criterion}"`, "ref", build.warnings) : { id, claim: text, status: "not_verified", owner: pr.meta.author.login };
  if (ac.status === "Met" && refs.length > 0 && claim.status === "not_verified") {
    build.warnings.push(`criterion "${ac.criterion}": no ref matched the diff; claim ${id} is not_verified`);
  }
  build.claims.push(claim);
  return id;
}

// Strips a context item's path down to the bare note name (no folder, no extension) so the
// rendered link never leaks the vault layout the brief's lint rule already forbids in prose.
function noteNameFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.[^./]+$/, "");
}

// "Related notes" - the context step's qmd/grep hits, rendered as wikilinks per the brief. Not a
// claim: prior notes are background the composer surfaces, not a diff/ticket statement to check.
function renderContextSection(context: ContextData | undefined): string {
  if (!context || context.items.length === 0) return "";
  const lines = ["## Related notes", ""];
  for (const item of context.items) {
    if (typeof item === "string") {
      lines.push(`- [[${noteNameFromPath(item)}]]`);
    } else {
      const snippet = item.snippet ? `: ${item.snippet}` : "";
      lines.push(`- [[${noteNameFromPath(item.path)}]]${snippet}`);
    }
  }
  return lines.join("\n");
}

function renderQuestionsSection(questions: QuestionItem[]): string {
  const lines = ["## Bring your questions", ""];
  if (questions.length === 0) {
    lines.push("No open questions.");
    return lines.join("\n");
  }
  lines.push(":::steps");
  for (const q of questions) lines.push(`**${q.title}**: ${q.question} (\`${q.pointer}\`)`, "");
  lines.push(":::");
  return lines.join("\n").trimEnd();
}

function renderRisksSection(risks: RiskItem[]): string {
  const lines = ["## Risks", ""];
  if (risks.length === 0) {
    lines.push("No risks identified.");
    return lines.join("\n");
  }
  lines.push(":::risks", "| Risk | Description | Blast radius | File |", "|---|---|---|---|");
  for (const r of risks) {
    lines.push(`| ${escapeTableCell(r.title)} | ${escapeTableCell(r.description)} | ${escapeTableCell(r.blast_radius)} | ${escapeTableCell(r.file)} |`);
  }
  lines.push(":::");
  return lines.join("\n").trimEnd();
}

// Collapsed <details>, per the brief - and raw HTML since none of the available directives fit
// a classification log. Never becomes claims: comment triage is classification, not a
// diff/ticket statement, and it must never feed back into the story/judgment sections (the
// isolation rule this port keeps even though the agent loop itself lives outside this file).
function renderCommentTriageSection(entries: WalkInputs["commentTriage"]): string {
  const lines = ["## Prior discussion", ""];
  if (!entries || entries.length === 0) {
    lines.push("No comments or reviews yet.");
    return lines.join("\n");
  }
  const items = entries
    .map((e) => {
      const kind = e.author_kind.toUpperCase();
      const authNote = e.author_kind === "human" && e.human_authenticity && e.human_authenticity !== "genuine" ? ` (${e.human_authenticity})` : "";
      const resolved = e.resolved ? " [resolved]" : "";
      return `<li><strong>${escapeHtmlText(e.author)}</strong> <em>${kind}</em>${authNote}${resolved}: ${escapeHtmlText(e.summary)}</li>`;
    })
    .join("\n");
  lines.push(`<details>`, `<summary>Prior discussion (${entries.length})</summary>`, "", "<ul>", items, "</ul>", "", `</details>`);
  return lines.join("\n");
}

// The hidden judgment: a <details> reveal at the end, per the brief. No verdicts are recorded
// here - this only renders whatever the judgment agent already decided; the ledger carries none
// of it, since a verdict comes from the agent loop later (mate-doc verdict), not from composing
// the walk.
function renderJudgmentSection(j: JudgmentData): string {
  const risksHtml = j.risks_summary.length > 0 ? j.risks_summary.map((r) => `<li>${renderProseHtml(r)}</li>`).join("\n") : "<li>None called out.</li>";
  const gapsHtml = j.gaps.length > 0 ? j.gaps.map((g) => `<li>${renderProseHtml(g)}</li>`).join("\n") : "<li>None called out.</li>";
  return [
    "## Judgment",
    "",
    "<details>",
    "<summary>Reveal the AI's judgment</summary>",
    "",
    `<p><strong>Overall:</strong> ${escapeHtmlText(j.overall)}</p>`,
    `<p>${renderProseHtml(j.fit)}</p>`,
    "<p><strong>Risks:</strong></p>",
    `<ul>${risksHtml}</ul>`,
    "<p><strong>Gaps:</strong></p>",
    `<ul>${gapsHtml}</ul>`,
    "",
    "</details>",
  ].join("\n");
}

// Block-style scalar, quoted whenever the value isn't a bare-safe token, so lines stay easy for
// applyVerdictToYaml's line-oriented editor to find and replace later.
function yamlBlockScalar(value: string | number): string {
  if (typeof value === "number") return String(value);
  return yamlString(value);
}

// One claim per list item, one key per line, matching the shape `mate-doc verdict` edits
// (src/commands/verdict.ts: "- id: Cn" then two-space-deeper keys). renderClaimsYaml used to
// emit each claim as a single JSON object on one line; verdict's line-oriented editor can only
// find and patch a claim written this way.
function renderClaimBlock(claim: Claim): string {
  const lines = [`  - id: ${claim.id}`, `    claim: ${yamlBlockScalar(claim.claim)}`, `    status: ${claim.status}`];
  if (claim.evidence) {
    lines.push("    evidence:");
    for (const [key, value] of Object.entries(claim.evidence)) {
      lines.push(`      ${key}: ${yamlBlockScalar(value as string | number)}`);
    }
  }
  if (claim.verdict) lines.push(`    verdict: ${claim.verdict}`);
  if (claim.checked_by) lines.push(`    checked_by: ${yamlBlockScalar(claim.checked_by)}`);
  if (claim.checked_at) lines.push(`    checked_at: ${claim.checked_at}`);
  if (claim.ttl_days !== undefined) lines.push(`    ttl_days: ${claim.ttl_days}`);
  if (claim.owner) lines.push(`    owner: ${yamlBlockScalar(claim.owner)}`);
  return lines.join("\n");
}

function renderClaimsYaml(claims: Claim[], author: string): string {
  const head = `author: ${yamlString(author)}\n`;
  if (claims.length === 0) return `${head}claims: []\n`;
  return `${head}claims:\n` + claims.map(renderClaimBlock).join("\n") + "\n";
}

export interface ComposeOptions {
  author: string; // who wrote this ledger, from detectActor()
  now?: Date; // build-walk.py required WALK_TODAY for the same reason: agents can't compute dates
}

export function composeWalk(pr: FetchedPr, inputs: WalkInputs, opts: ComposeOptions): ComposedWalk {
  const now = opts.now ?? new Date();
  const checkedAt = now.toISOString().slice(0, 10);
  const build: ClaimBuild = { claims: [], nextId: 1, warnings: [] };

  const parts: string[] = [renderRailSection(pr, inputs, inputs.ticketFit), renderHeader(pr), renderStorySection(inputs.story)];

  inputs.story.groups.forEach((group, gi) => {
    const claimId = buildGroupClaim(pr, group, gi + 1, build);
    parts.push(renderGroupSection(group, gi + 1, claimId, pr.diff));
  });

  parts.push(renderTicketFitSection(pr, inputs.ticketFit, build));
  parts.push(renderQuestionsSection(inputs.questions));
  parts.push(renderRisksSection(inputs.risks));
  parts.push(renderContextSection(inputs.context));
  parts.push(renderCommentTriageSection(inputs.commentTriage));
  parts.push(renderJudgmentSection(inputs.judgment));

  const body = parts.filter((p) => p.length > 0).join("\n\n");
  const md = `${renderFrontmatter(pr, inputs, checkedAt)}\n\n${body}\n`;

  return { files: { "index.md": md, "claims.yaml": renderClaimsYaml(build.claims, opts.author) }, warnings: build.warnings };
}
