#!/usr/bin/env bun
// mate-doc command dispatch.
import { COMMANDS, EXIT, type Command, type Env } from "./types.ts";
import { runApprove } from "./commands/approve.ts";
import { runAudit } from "./commands/audit.ts";
import { runBuild } from "./commands/build.ts";
import { runForget } from "./commands/forget.ts";
import { runGate } from "./commands/gate.ts";
import { runLint } from "./commands/lint.ts";
import { runNew } from "./commands/new.ts";
import { runOpen } from "./commands/open.ts";
import { runSetup } from "./commands/setup.ts";
import { runStatus } from "./commands/status.ts";
import { runVerdict } from "./commands/verdict.ts";

const HELP = `mate-doc: markdown docs you can trust

Usage: mate-doc <command> [args]

  setup                      check bun, install deps, link mate-doc onto PATH
  new <path> --shape <s>     start a doc: plain | guide | brief | walk
  open <path>                view any markdown in the browser
  build <path> [--out dir]   write self-contained HTML
  lint <path>                check pages and ledger
  audit <path> [--json]      run evidence checks, list what needs a verdict
  verdict <path> <Cn> ...    record a judgment for one claim
  gate <path>                pass or fail, with reasons
  approve <path>             mark official (a person, never an agent)
  publish <path> --to <t>    share an official, fresh doc
  status [<path>]            level, freshness, open claims
  forget <folder>            stop serving a folder
  walk <pr-url>              build a PR walk
`;

function isCommand(s: string): s is Command {
  return (COMMANDS as readonly string[]).includes(s);
}

export interface MainDeps {
  env?: Env; // injected in tests; defaults to the real Env everywhere it's needed
}

export async function main(argv: string[], deps: MainDeps = {}): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    process.stdout.write(HELP);
    return cmd ? EXIT.ok : EXIT.usage;
  }
  if (!isCommand(cmd)) {
    process.stderr.write(`mate-doc: unknown command "${cmd}". Run mate-doc --help.\n`);
    return EXIT.usage;
  }

  switch (cmd) {
    case "setup":
      return runSetup();
    case "new":
      return runNew(rest);
    case "build":
      return deps.env ? runBuild(rest, deps.env) : runBuild(rest);
    case "lint":
      return runLint(rest);
    case "audit":
      return deps.env ? runAudit(rest, deps.env) : runAudit(rest);
    case "verdict":
      return runVerdict(rest);
    case "gate":
      return deps.env ? runGate(rest, deps.env) : runGate(rest);
    case "approve":
      return deps.env ? runApprove(rest, deps.env) : runApprove(rest);
    case "status":
      return deps.env ? runStatus(rest, deps.env) : runStatus(rest);
    case "open":
      return runOpen(rest);
    case "forget":
      return runForget(rest);
    case "publish":
    case "walk":
      process.stderr.write(`mate-doc ${cmd}: not built yet.\n`);
      return EXIT.usage;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
