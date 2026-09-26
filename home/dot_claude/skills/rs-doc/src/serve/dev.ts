#!/usr/bin/env bun
// Manual smoke check: `bun src/serve/dev.ts <folder>` serves that folder with
// trivial stub parse/render (no real parser/renderer wired yet).
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Doc, Ledger, Parse, Render } from "../types.ts";
import { addFolder } from "./state.ts";
import { serve } from "./server.ts";

const target = process.argv[2];
if (!target) {
  process.stderr.write("usage: bun src/serve/dev.ts <folder>\n");
  process.exit(2);
}

const parse: Parse = (src, path): Doc => ({
  path,
  frontmatter: { extra: {} },
  body: [],
  headings: [],
  claimRefs: [],
  errors: [],
});
const render: Render = () => "<html><body>stub page</body></html>";
const loadLedger = (_docDir: string): Ledger | null => null;

const stateDir = await mkdtemp(join(tmpdir(), "mate-doc-dev-state-"));
const entry = await addFolder(stateDir, target);
const handle = await serve({ host: "127.0.0.1", port: 52010, stateDir, parse, render, loadLedger });

process.stdout.write(`serving at ${handle.url}/${entry.alias}/  (state dir: ${stateDir})\n`);
process.stdout.write("Ctrl-C to stop.\n");

process.on("SIGINT", async () => {
  await handle.stop();
  process.exit(0);
});
