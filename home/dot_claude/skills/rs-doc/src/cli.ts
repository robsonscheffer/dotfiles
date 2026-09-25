#!/usr/bin/env bun
// mate-doc command dispatch. Commands are stubs until their lane lands.
import { COMMANDS, EXIT, type Command } from "./types.ts";

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

export async function main(argv: string[]): Promise<number> {
  const [cmd] = argv;
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    process.stdout.write(HELP);
    return cmd ? EXIT.ok : EXIT.usage;
  }
  if (!isCommand(cmd)) {
    process.stderr.write(`mate-doc: unknown command "${cmd}". Run mate-doc --help.\n`);
    return EXIT.usage;
  }
  if (cmd === "setup") {
    process.stderr.write("mate-doc: run bin/setup from the skill directory.\n");
    return EXIT.usage;
  }
  process.stderr.write(`mate-doc ${cmd}: not built yet.\n`);
  return EXIT.usage;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
