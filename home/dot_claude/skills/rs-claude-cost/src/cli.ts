#!/usr/bin/env bun
// rs-claude-cost: a deterministic weekly Claude Code cost report.
// No step calls a model (D1). This CLI parses flags and picks the week;
// scanning, pricing, metrics, and rendering land in later steps against the
// same flags.

import { homedir } from "node:os";
import { join } from "node:path";
import { lastCompletedWeek, parseIsoWeek, type TimeZoneMode } from "./date.ts";

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
  --root <dir>            Alternate transcript root (default: ~/.claude/projects)
  --no-record            Do not touch history or findings
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
  root: string;
  noRecord: boolean;
  help: boolean;
}

function expandHome(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

function defaultRoot(): string {
  return join(homedir(), ".claude", "projects");
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
      case "--root":
        flags.root = expandHome(argv[++i] ?? "");
        break;
      case "--no-record":
        flags.noRecord = true;
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

  // Picking the week is wired up now; scanning and reporting land in the
  // scan-and-normalize step.
  const week = flags.week
    ? parseIsoWeek(flags.week, flags.tz)
    : lastCompletedWeek(new Date(), flags.tz);
  console.log(JSON.stringify({ isoWeek: week.isoWeek }));
  return 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
