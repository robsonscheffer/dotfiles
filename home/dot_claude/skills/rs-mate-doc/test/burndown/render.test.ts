import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { extractFrontmatter } from "../../src/parser/frontmatter.ts";
import { parse } from "../../src/parser/index.ts";
import { render } from "../../src/render/index.ts";
import { renderBurndownMarkdown } from "../../src/burndown/render.ts";
import type { Ticket } from "../../src/burndown/scan.ts";

function ticket(overrides: Partial<Ticket>): Ticket {
  return {
    id: "CANVAS-001",
    number: 1,
    slug: "first",
    bucket: "active",
    path: "/repo/docs/plans/active/CANVAS-001-first/README.md",
    status: "open",
    needs: "spec",
    tags: [],
    phase: null,
    depends: [],
    title: "First thing",
    ...overrides,
  };
}

describe("burndown: renderBurndownMarkdown", () => {
  test("writes frontmatter, a :::tiles summary, and one table per phase", () => {
    const outPath = "/repo/docs/dashboards/canvas-epic.md";
    const md = renderBurndownMarkdown({
      outPath,
      epicTitle: "Canvas rebuild",
      epicPath: "/repo/docs/epics/canvas.md",
      generatedDate: "2026-09-25",
      tickets: [
        ticket({ id: "CANVAS-001", phase: 0, status: "done", path: "/repo/docs/plans/done/CANVAS-001-first/README.md" }),
        ticket({ id: "CANVAS-002", phase: 0, status: "building", depends: ["CANVAS-001"] }),
        ticket({ id: "CANVAS-003", phase: null, status: "open" }),
      ],
      phaseTitles: { 0: "Groundwork" },
    });

    expect(md).toContain('title: "Canvas rebuild"');
    expect(md).toContain("type: dashboard");
    expect(md).toContain(":::tiles");
    expect(md).toContain("Total: 3");
    expect(md).toContain("Done: 1");
    expect(md).toContain("Building: 1");
    expect(md).toContain("## Phase 0 · Groundwork (1 of 2 done)");
    expect(md).toContain("## Unphased (0 of 1 done)");
    expect(md).toContain("[CANVAS-001](../plans/done/CANVAS-001-first/README.md)");
    expect(md).toContain("[epic](../epics/canvas.md)");
  });

  test("quotes an epic title with a colon and a hash so the frontmatter round-trips exactly", () => {
    const epicTitle = "Epic: Canvas v2: Editor #1";
    const md = renderBurndownMarkdown({
      outPath: "/repo/docs/dashboards/canvas-epic.md",
      epicTitle,
      epicPath: "/repo/docs/epics/canvas.md",
      generatedDate: "2026-09-25",
      tickets: [],
      phaseTitles: {},
    });

    const { frontmatter } = extractFrontmatter(md);
    expect(frontmatter.title).toBe(epicTitle);
    expect(frontmatter.summary).toBe(`Burndown for ${epicTitle}.`);
  });

  test("escapes pipe characters in ticket titles so the table doesn't break", () => {
    const md = renderBurndownMarkdown({
      outPath: "/repo/docs/dashboards/canvas-epic.md",
      epicTitle: "Canvas rebuild",
      epicPath: "/repo/docs/epics/canvas.md",
      generatedDate: "2026-09-25",
      tickets: [ticket({ title: "Fix a | pipe in the title" })],
      phaseTitles: {},
    });
    expect(md).toContain("Fix a \\| pipe in the title");
  });

  function build(tickets: Ticket[], phaseTitles: Record<number, string> = {}): string {
    return renderBurndownMarkdown({
      outPath: "/repo/docs/dashboards/canvas-epic.md",
      epicTitle: "Widgets rebuild",
      epicPath: "/repo/docs/epics/widgets.md",
      generatedDate: "2026-09-25",
      tickets,
      phaseTitles,
    });
  }

  test("marks a finished phase with a check and no count, and an open one with a count", () => {
    const md = build([
      ticket({ id: "ABC-10", phase: 1, status: "done" }),
      ticket({ id: "ABC-11", phase: 1, status: "open" }),
      ticket({ id: "ABC-12", phase: 1, status: "open" }),
      ticket({ id: "ABC-20", phase: 2, status: "done" }),
      ticket({ id: "ABC-21", phase: 2, status: "done" }),
    ]);
    expect(md).toContain("## Phase 1 (1 of 3 done)\n");
    expect(md).toContain("## Phase 2 ✓\n");
    expect(md).not.toContain("Phase 2 (");
  });

  test("wraps each phase table in a :::reveal labelled with the phase's ticket ids", () => {
    const md = build([
      ticket({ id: "ABC-10", phase: 1, status: "done" }),
      ticket({ id: "ABC-11", phase: 1, status: "open" }),
      ticket({ id: "ABC-20", phase: 2, status: "open" }),
    ]);
    expect(md).toContain(":::reveal ABC-10, ABC-11\n\n| ID | Title");
    expect(md).toContain(":::reveal ABC-20\n\n| ID | Title");
    expect(md).toMatch(/\| \[ABC-11\][^\n]*\n\n:::\n/);
  });

  test("uses '<n> tickets' when the id list is longer than 80 characters", () => {
    const tickets = Array.from({ length: 12 }, (_, i) =>
      ticket({ id: `ABC-${100 + i}`, phase: 1, status: "open" }),
    );
    const md = build(tickets);
    expect(md).toContain(":::reveal 12 tickets\n");
    expect(md).not.toContain(":::reveal ABC-100");
  });

  test("orders phases numerically (2 before 10) with unphased last", () => {
    const md = build([
      ticket({ id: "ABC-1", phase: 10 }),
      ticket({ id: "ABC-2", phase: null }),
      ticket({ id: "ABC-3", phase: 2 }),
    ]);
    const p2 = md.indexOf("## Phase 2 ");
    const p10 = md.indexOf("## Phase 10 ");
    const un = md.indexOf("## Unphased ");
    expect(p2).toBeGreaterThan(-1);
    expect(p10).toBeGreaterThan(p2);
    expect(un).toBeGreaterThan(p10);
  });

  test("the page renderer emits one <details class=\"reveal\"> per phase", () => {
    const md = build([
      ticket({ id: "ABC-10", phase: 1, status: "done" }),
      ticket({ id: "ABC-20", phase: 2, status: "open" }),
      ticket({ id: "ABC-30", phase: null, status: "open" }),
    ]);
    const html = render(parse(md, "/repo/docs/dashboards/canvas-epic.md"), null, { theme: "auto" });
    expect(html.match(/<details class="reveal">/g)?.length).toBe(3);
    expect(html).toContain("<summary>ABC-10</summary>");
  });
});
