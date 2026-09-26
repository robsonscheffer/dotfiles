#!/usr/bin/env bun
// Entry point for the viewer server as its own detached process. `open.ts` spawns this instead
// of calling serve() in-process, so the browser can keep pointing at a running server after the
// `mate-doc open` command itself exits. Real parse/render/loadLedger, wired here directly
// (loadLedger is the sync variant: ServeOptions.loadLedger is sync, ledger/index.ts's is async).
import { parse } from "../parser/index.ts";
import { render } from "../render/index.ts";
import { serve } from "./server.ts";
import { loadLedgerSync } from "./ledger-sync.ts";

function argVal(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const portArg = argVal("--port");
  const stateDir = argVal("--state-dir");
  if (!stateDir || !portArg) {
    process.stderr.write("mate-doc detached-server: --port and --state-dir are required\n");
    process.exit(3);
  }
  await serve({
    host: "127.0.0.1",
    port: Number(portArg),
    stateDir,
    parse,
    render,
    loadLedger: loadLedgerSync,
  });
  // Keep the process alive: serve() only starts the listener, it does not block.
  process.stdout.write("mate-doc detached-server: ready\n");
}

if (import.meta.main) {
  void main();
}
