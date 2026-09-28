// Manual sample page generator. Run with `bun run test/render/sample.ts` to produce
// test/render/.sample-output.html for a visual check with the network off. Not a test file
// (no *.test.ts suffix), so `bun test` never picks it up.

import { render } from "../../src/render/index.ts";
import {
  claimRef,
  codeBlock,
  directive,
  heading,
  link,
  listItem,
  makeClaim,
  makeDoc,
  makeLedger,
  para,
  span,
  table,
  text,
} from "./helpers.ts";
import type { Block } from "../../src/types.ts";

const claims = [
  makeClaim({
    id: "C7",
    claim: "Checkout clicks take their label from the nearest data-analytics-name attribute.",
    status: "verified",
    verdict: "supports",
    checked_by: "agent:claude",
    checked_at: "2026-09-25",
    ttl_days: 30,
    evidence: {
      kind: "code",
      ref: "acme/web@origin/main:src/analytics/label.ts:42",
      excerpt: "const label = el.closest('[data-analytics-name]')?.dataset.analyticsName",
      needs: "git",
    },
  }),
  makeClaim({
    id: "C12",
    claim: "918 people qualify once the last 7 days are excluded.",
    status: "verified",
    verdict: "supports",
    checked_at: "2026-09-25",
    evidence: { kind: "query", sql: "queries/c12-qualifying.sql", expect: { rows: 1, value: 918 }, needs: "snow" },
  }),
  makeClaim({ id: "C19", claim: "Which ID the lab record splits by.", status: "not_verified", owner: "Sam" }),
];

const body: Block[] = [
  heading(2, "overview", "Overview"),
  para(text("Checkout events carry their label from the nearest attribute."), claimRef("C7")),
  directive("means", { children: [para(text("The label is computed at click time, not at render time."))] }),
  heading(2, "term-collision-demo", "Order, defined"),
  directive("collide", {
    args: ["order"],
    children: [para(text("An order here means a checkout order, not a work order."))],
  }),
  para(text("Every order gets a receipt once payment clears.")),
  heading(2, "numbers", "Numbers"),
  directive("tiles", { raw: ["Qualifying: 918 {C12}", "Excluded: 42"] }),
  heading(2, "flow", "Flow"),
  directive("flow", { raw: ["cart -> checkout : submit", "checkout -> paid : confirm", "checkout -> abandoned : timeout"] }),
  heading(2, "steps", "Rollout steps"),
  directive("steps", {
    children: [para(text("Ship behind a flag.")), para(text("Watch the dashboards for a day.")), para(text("Flip to 100%."))],
  }),
  heading(3, "tabs-demo", "Environments"),
  directive("tabs", {
    children: [
      heading(2, "tab-staging", "Staging"),
      para(text("Point the client at the staging origin and use a seeded test account.")),
      heading(2, "tab-prod", "Production"),
      para(text("Real traffic. Roll out behind the flag and watch the dashboards.")),
    ],
  }),
  heading(2, "cards", "Related pages"),
  directive("cards", {
    children: [para(link("url", "https://example.com/runbook", text("Runbook"))), para(link("url", "https://example.com/dashboard", text("Dashboard")))],
  }),
  heading(2, "decide", "Open question"),
  directive("decide", { args: ["Sam"], children: [para(text("Which ID does the lab record split by?"))] }),
  heading(2, "risks", "Risks"),
  directive("risks", {
    children: [
      table(
        [[text("Risk")], [text("Severity")]],
        [
          [[text("Data loss on retry")], [text("HIGH")]],
          [[text("Slow rollout")], [text("MED")]],
          [[text("Cosmetic label mismatch")], [text("LOW")]],
        ],
      ),
    ],
  }),
  heading(2, "diff", "Recent change"),
  codeBlock("-const label = el.dataset.name\n+const label = el.closest('[data-analytics-name]')?.dataset.analyticsName", "diff", {
    title: "src/analytics/label.ts",
  }),
  heading(2, "code", "Sample code"),
  codeBlock("function label(el) {\n  // find the nearest attribute\n  return el.closest('[data-analytics-name]')?.dataset.analyticsName;\n}", "javascript"),
  heading(2, "not-verified", "Open claims"),
  directive("notverified"),
  para(text("A claim that never made it into the ledger:"), claimRef("C99")),
];

const doc = makeDoc(body, { title: "Checkout label tracking", summary: "How checkout events get their label, and what's still open." }, [
  { level: 2, id: "overview", text: "Overview", pos: span() },
  { level: 2, id: "term-collision-demo", text: "Order, defined", pos: span() },
  { level: 2, id: "numbers", text: "Numbers", pos: span() },
  { level: 2, id: "flow", text: "Flow", pos: span() },
  { level: 2, id: "steps", text: "Rollout steps", pos: span() },
  { level: 3, id: "tabs-demo", text: "Environments", pos: span() },
  { level: 2, id: "cards", text: "Related pages", pos: span() },
  { level: 2, id: "decide", text: "Open question", pos: span() },
  { level: 2, id: "risks", text: "Risks", pos: span() },
  { level: 2, id: "diff", text: "Recent change", pos: span() },
  { level: 2, id: "code", text: "Sample code", pos: span() },
  { level: 2, id: "not-verified", text: "Open claims", pos: span() },
]);

const html = render(doc, makeLedger(claims), {
  theme: "auto",
  banner: { level: "official", approvedAt: "2026-09-25", claims: 3, open: 1, fresh: true },
});

await Bun.write(new URL("./.sample-output.html", import.meta.url), html);
console.log("wrote test/render/.sample-output.html");
