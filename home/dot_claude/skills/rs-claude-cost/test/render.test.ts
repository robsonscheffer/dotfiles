import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { buildReport } from "../src/report.ts";
import { parseIsoWeek } from "../src/date.ts";
import { renderCli } from "../src/render/cli.ts";
import { renderHtml } from "../src/render/html.ts";
import { WHATIF_CAVEAT } from "../src/whatif.ts";
import { assistantLine, makeTmpRoot, writeJsonl } from "./helpers.ts";

const PRICING_PATH = join(import.meta.dir, "..", "pricing.json");
const THRESHOLDS_PATH = join(import.meta.dir, "..", "thresholds.json");
const SCHEMA_PATH = join(import.meta.dir, "..", "schema", "report.schema.json");
const GOLDEN_CLI = join(import.meta.dir, "fixtures", "golden", "week.cli.txt");
const GOLDEN_HTML = join(import.meta.dir, "fixtures", "golden", "week.html");

async function buildGoldenWeek() {
  const root = makeTmpRoot("rs-cost-golden-week");
  const outDir = makeTmpRoot("rs-cost-golden-week-out");
  writeJsonl(join(root, "proj", "session-golden.jsonl"), [
    assistantLine({
      messageId: "m1",
      timestamp: "2026-09-22T10:00:00.000Z",
      model: "claude-sonnet-5",
      cwd: "/Users/robson.scheffer/example-project",
      gitBranch: "main",
      version: "2.1.242",
      usage: {
        input_tokens: 10_000,
        cache_read_input_tokens: 1_000,
        cache_creation_input_tokens: 500,
        output_tokens: 200,
      },
    }),
    assistantLine({
      messageId: "m2",
      timestamp: "2026-09-22T10:05:00.000Z",
      model: "claude-sonnet-5",
      cwd: "/Users/robson.scheffer/example-project",
      gitBranch: "main",
      version: "2.1.242",
      usage: {
        input_tokens: 2_000,
        cache_read_input_tokens: 8_000,
        cache_creation_input_tokens: 0,
        output_tokens: 300,
      },
    }),
  ]);

  const week = parseIsoWeek("2026-W39", "UTC");
  return buildReport({
    root,
    week,
    tz: "UTC",
    pricingPath: PRICING_PATH,
    thresholdsPath: THRESHOLDS_PATH,
    outDir,
    noRecord: true,
  });
}

describe("golden renders", () => {
  test("terminal summary matches the golden file, stays under 45 lines, at 100 columns", async () => {
    const { report } = await buildGoldenWeek();
    const cli = renderCli(report, { color: false, hasPriorWeek: false });
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN_CLI, `${cli}\n`);
    const golden = readFileSync(GOLDEN_CLI, "utf8").replace(/\n$/, "");
    expect(cli).toBe(golden);

    const lines = cli.split("\n");
    expect(lines.length).toBeLessThanOrEqual(45);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(100);
  });

  test("NO_COLOR leaves no escape codes", async () => {
    const { report } = await buildGoldenWeek();
    const cli = renderCli(report, { color: false, hasPriorWeek: false });
    // eslint-disable-next-line no-control-regex
    expect(/\x1b/.test(cli)).toBe(false);
  });

  test("stays at most 45 lines and never wider than the render width, at 80 and 100 columns", async () => {
    const { report } = await buildGoldenWeek();
    for (const width of [80, 100]) {
      const cli = renderCli(report, { color: false, hasPriorWeek: false, width });
      const lines = cli.split("\n");
      expect(lines.length).toBeLessThanOrEqual(45);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(width);
    }
  });

  test("model labels render, never raw ids; unlabeled models fall back to their id", async () => {
    const { report } = await buildGoldenWeek();
    const cli = renderCli(report, { color: false, hasPriorWeek: false });
    expect(cli).toContain("Sonnet 5");
    expect(cli).not.toContain("claude-sonnet-5");
  });

  test("an unknown model shows a warning banner in the terminal", async () => {
    const { report } = await buildGoldenWeek();
    report.pricing.unknownModels = ["claude-future-9"];
    const cli = renderCli(report, { color: false, hasPriorWeek: false });
    expect(cli.split("\n")[1]).toContain("warning: unknown model(s): claude-future-9");
  });

  test("HTML matches the golden file and contains no URLs", async () => {
    const { report, exitCode } = await buildGoldenWeek();
    const html = renderHtml(report, {
      caveat: WHATIF_CAVEAT,
      rebuildCommand: "rs-claude-cost --week 2026-W39 --tz UTC",
      exitCode,
    });
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN_HTML, html);
    const golden = readFileSync(GOLDEN_HTML, "utf8");
    expect(html).toBe(golden);
    expect(/https?:\/\//.test(html)).toBe(false);
    expect(/xmlns/.test(html)).toBe(false);
  });

  test("the JSON report validates against schema/report.schema.json", async () => {
    const { report } = await buildGoldenWeek();
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(schema);
    const ok = validate(report);
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });
});
