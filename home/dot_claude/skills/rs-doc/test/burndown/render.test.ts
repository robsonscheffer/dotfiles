import { join } from "node:path";
import { describe, expect, test } from "bun:test";
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

    expect(md).toContain("title: Canvas rebuild");
    expect(md).toContain("type: dashboard");
    expect(md).toContain(":::tiles");
    expect(md).toContain("Total: 3");
    expect(md).toContain("Done: 1");
    expect(md).toContain("Building: 1");
    expect(md).toContain("## Phase 0 · Groundwork (1/2)");
    expect(md).toContain("## Unphased (0/1)");
    expect(md).toContain("[CANVAS-001](../plans/done/CANVAS-001-first/README.md)");
    expect(md).toContain("[epic](../epics/canvas.md)");
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
});
