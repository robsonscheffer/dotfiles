// The WRN lane's slice of compose.ts: the rail block a walk emits for render/directives.ts's
// :::rail. Kept in its own file so it never collides with compose.test.ts, which the WK lane owns.
import { describe, expect, test } from "bun:test";
import { parse } from "../../src/parser/index.ts";
import { render } from "../../src/render/index.ts";
import { composeWalk } from "../../src/walk/compose.ts";
import { FETCHED_PR, WALK_INPUTS } from "./fixture.ts";

const NOW = new Date("2026-09-25T00:00:00Z");

describe("composeWalk rail", () => {
  test("emits a :::rail block with author, PR link, branch, ticket, comment count, and risk count", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW });
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
    const composed = composeWalk(FETCHED_PR, inputsWithoutTicket, { now: NOW });
    const md = composed.files["index.md"]!;
    expect(md).toContain(":::rail");
    expect(md).not.toContain("Ticket:");
  });

  test("the composed rail parses and renders as a sticky panel", () => {
    const composed = composeWalk(FETCHED_PR, WALK_INPUTS, { now: NOW });
    const doc = parse(composed.files["index.md"]!, "index.md");
    expect(doc.errors).toHaveLength(0);
    const html = render(doc, null, { theme: "auto" });
    expect(html).toContain('class="rail"');
    expect(html).toContain("Author");
    expect(html).toContain(`#${FETCHED_PR.meta.number}`);
  });
});
