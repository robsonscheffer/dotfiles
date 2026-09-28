#!/usr/bin/env bun
// rs-claude-cost: a deterministic weekly Claude Code cost report.
// No step calls a model (D1). This CLI parses flags, builds the one report
// object (D2), and for now prints it as JSON — the terminal and HTML
// renderers land in a later step, against the same object.

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { lastCompletedWeek, parseIsoWeek, type TimeZoneMode } from "./date.ts";
import { buildReport } from "./report.ts";
import { renderCli } from "./render/cli.ts";
import { renderHtml } from "./render/html.ts";
import { WHATIF_CAVEAT } from "./whatif.ts";

const HELP = `rs-claude-cost - a deterministic weekly Claude Code cost report

Usage: rs-claude-cost [options]

Options:
  --week YYYY-Www     The week to report (default: last completed week)
  --tz <local|UTC>     Time zone for week boundaries (default: local)
  --format cli|json|html|all   What to write (default: all)
  --json               Print JSON to stdout instead of the summary
  --open                Open the HTML page when done
  --out <dir>           Where to write the week's files (default: state dir)
  --pricing <file>       Alternate price table
  --thresholds <file>    Alternate thresholds table
  --root <dir>            Alternate transcript root (default: ~/.claude/projects)
  --no-record            Do not touch history or findings
  --quiet                Do not print the terminal summary
  --help                 Show this help

Exit codes: 0 clean, 2 written with warnings, 1 failed reconciliation, 64 bad usage.
`;

interface Flags {
  week?: string;
  tz: TimeZoneMode;
  format: "cli" | "json" | "html" | "all";
  json: boolean;
  open: boolean;
  out?: string;
  pricing?: string;
  thresholds?: string;
  root: string;
  noRecord: boolean;
  quiet: boolean;
  help: boolean;
}

function expandHome(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

function defaultRoot(): string {
  return join(homedir(), ".claude", "projects");
}

function defaultOut(): string {
  return join(homedir(), ".local", "state", "rs-claude-cost", "weeks");
}

function defaultPricing(): string {
  return join(import.meta.dir, "..", "pricing.json");
}

function defaultThresholds(): string {
  return join(import.meta.dir, "..", "thresholds.json");
}

class UsageError extends Error {}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {
    tz: "local",
    format: "all",
    json: false,
    open: false,
    root: defaultRoot(),
    noRecord: false,
    quiet: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        flags.help = true;
        break;
      case "--week":
        flags.week = argv[++i];
        break;
      case "--tz": {
        const value = argv[++i];
        if (value !== "local" && value !== "UTC") {
          throw new UsageError(`--tz must be "local" or "UTC", got: ${value}`);
        }
        flags.tz = value;
        break;
      }
      case "--format": {
        const value = argv[++i];
        if (value !== "cli" && value !== "json" && value !== "html" && value !== "all") {
          throw new UsageError(`--format must be cli, json, html, or all, got: ${value}`);
        }
        flags.format = value;
        break;
      }
      case "--json":
        flags.json = true;
        break;
      case "--open":
        flags.open = true;
        break;
      case "--out":
        flags.out = expandHome(argv[++i] ?? "");
        break;
      case "--pricing":
        flags.pricing = expandHome(argv[++i] ?? "");
        break;
      case "--thresholds":
        flags.thresholds = expandHome(argv[++i] ?? "");
        break;
      case "--root":
        flags.root = expandHome(argv[++i] ?? "");
        break;
      case "--no-record":
        flags.noRecord = true;
        break;
      case "--quiet":
        flags.quiet = true;
        break;
      default:
        throw new UsageError(`unknown flag: ${arg}`);
    }
  }

  return flags;
}

export async function main(argv: string[]): Promise<number> {
  let flags: Flags;
  try {
    flags = parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`rs-claude-cost: ${err.message}`);
      console.error(HELP);
      return 64;
    }
    throw err;
  }

  if (flags.help) {
    console.log(HELP);
    return 0;
  }

  const tz = flags.tz;
  const week = flags.week ? parseIsoWeek(flags.week, tz) : lastCompletedWeek(new Date(), tz);
  const pricingPath = flags.pricing ?? defaultPricing();
  const thresholdsPath = flags.thresholds ?? defaultThresholds();
  const outDir = flags.out ?? defaultOut();
  mkdirSync(outDir, { recursive: true });

  const { report, reconciled, exitCode, hasPriorWeek } = await buildReport({
    root: flags.root,
    week,
    tz,
    pricingPath,
    thresholdsPath,
    outDir,
    noRecord: flags.noRecord,
  });

  if (!reconciled) {
    console.error(
      "rs-claude-cost: reconciliation failed, nothing written. " +
        "Per-session and per-kind dollars did not sum to the total.",
    );
    return 1;
  }

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return exitCode;
  }

  const jsonPath = join(outDir, `${week.isoWeek}.json`);
  const htmlPath = join(outDir, `${week.isoWeek}.html`);
  const rebuildCommand = `rs-claude-cost --week ${week.isoWeek} --tz ${tz}`;

  if (flags.format === "cli" || flags.format === "json" || flags.format === "all") {
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  }
  if (flags.format === "html" || flags.format === "all") {
    const html = renderHtml(report, { caveat: WHATIF_CAVEAT, rebuildCommand, exitCode });
    writeFileSync(htmlPath, html);
  }

  if (flags.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else if (!flags.quiet) {
    const color = process.stdout.isTTY === true && !process.env.NO_COLOR;
    console.log(renderCli(report, { color, hasPriorWeek }));
    if (flags.format === "all" || flags.format === "html") {
      console.log(`page: ${htmlPath}`);
    }
  }

  if (flags.open && (flags.format === "html" || flags.format === "all")) {
    Bun.spawn(["open", htmlPath]);
  }

  return exitCode;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
