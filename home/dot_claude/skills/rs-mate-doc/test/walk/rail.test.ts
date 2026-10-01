// The WRN lane's slice of compose.ts: the rail block a walk emits for render/directives.ts's
// :::rail. Kept in its own file so it never collides with compose.test.ts, which the WK lane owns.
import { describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/index.ts";
import { render } from "../../src/render/index.ts";
import { composeWalk } from "../../src/walk/compose.ts";
import { FETCHED_PR, WALK_INPUTS } from "./fixture.ts";

const NOW = new Date("2026-09-25T00:00:00Z");
const AUTHOR = "agent:claude";

describe("composeWalk rail", () => {
  test("emits a :::rail block with author, PR link, branch, ticket, comment count, and risk count", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const md = composed.files["index.md"]!;
    expect(md).toContain(":::rail");
    expect(md).toContain("Author: sam");
    expect(md).toContain(`PR: [#${FETCHED_PR.meta.number}](${FETCHED_PR.meta.url})`);
    expect(md).toContain(`Branch: ${FETCHED_PR.meta.headRefName}`);
    expect(md).toContain(`Ticket: ${WALK_INPUTS.ticketFit!.ticket_key}`);
    expect(md).toContain(`Comments: ${WALK_INPUTS.commentTriage!.length}`);
    expect(md).toContain(`Risks: ${WALK_INPUTS.risks.length}`);
  });

  test("omits the Ticket line when the PR has no linked ticket", () => {
    const inputsWithoutTicket = { ...WALK_INPUTS, ticketFit: undefined };
    const composed = composeWalk(FETCHED_PR, inputsWithoutTicket, { now: NOW, author: AUTHOR });
    const md = composed.files["index.md"]!;
    expect(md).toContain(":::rail");
    expect(md).not.toContain("Ticket:");
  });

  test("the composed rail parses and renders as a sticky panel", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW, author: AUTHOR });
    const doc = parse(composed.files["index.md"]!, "index.md");
    expect(doc.errors).toHaveLength(0);
    const html = render(doc, null, { theme: "auto" });
    expect(html).toContain('class="rail"');
    expect(html).toContain("Author");
    expect(html).toContain(`#${FETCHED_PR.meta.number}`);
  });
});

describe("composeWalk page top", () => {
  const md = composeWalk(FETCHED_PR, WALK_INPUTS, { now: new Date("2026-09-25T00:00:00Z"), author: "agent:claude" }).files["index.md"]!;

  test("the title is only in the frontmatter: no body H1 and no header block", () => {
    expect(md).not.toMatch(/^# /m);
    expect(md).not.toContain("[View on GitHub]");
  });

  test("the rail carries repo, base, and change size", () => {
    const rail = md.slice(md.indexOf(":::rail"), md.indexOf(":::\n", md.indexOf(":::rail") + 7));
    expect(rail).toContain(`Repo: ${FETCHED_PR.repo}`);
    expect(rail).toContain(`Base: ${FETCHED_PR.meta.baseRefName}`);
    expect(rail).toContain(`Changes: +${FETCHED_PR.meta.additions} / -${FETCHED_PR.meta.deletions}, ${FETCHED_PR.meta.changedFiles} files`);
  });

  test("the lead appears once, without emphasis markers in the summary", () => {
    const withLead = { ...WALK_INPUTS, story: { ...WALK_INPUTS.story, lead: "**Facts**, not `warnings`" } };
    const out = composeWalk(FETCHED_PR, withLead, { now: new Date("2026-09-25T00:00:00Z"), author: "agent:claude" }).files["index.md"]!;
    expect(out).toContain('summary: "Facts, not warnings"');
    expect(out.split("not `warnings`").length - 1).toBe(0);
    expect(out).not.toContain("**Facts**");
  });
});
