// `mate-doc lint <path>`: parse every page, load the ledger, print each issue.
import { readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { loadLedger } from "../ledger/index.ts";
import { lint } from "../lint/index.ts";
import { parse } from "../parser/index.ts";
import { collectMarkdownFiles } from "./shared.ts";
import { EXIT } from "../types.ts";

export async function runLint(argv: string[]): Promise<number> {
  const [target] = argv;
  if (!target) {
    process.stderr.write("mate-doc lint: usage: mate-doc lint <path>\n");
    return EXIT.usage;
  }
  const st = await stat(target).catch(() => null);
  if (!st) {
    process.stderr.write(`mate-doc lint: no such file or folder: ${target}\n`);
    return EXIT.usage;
  }
  const docDir = st.isDirectory() ? target : dirname(target);
  const mdFiles = st.isDirectory() ? await collectMarkdownFiles(target) : [target];

  const docs = [];
  for (const f of mdFiles) docs.push(parse(await readFile(f, "utf8"), f));
  const ledger = await loadLedger(docDir);

  const issues = lint(docs, ledger);
  for (const issue of issues) {
    const line = issue.pos?.start.line ?? 1;
    const col = issue.pos?.start.column ?? 1;
    process.stdout.write(`${issue.path}:${line}:${col} ${issue.rule} ${issue.message}\n`);
  }

  const hasError = issues.some((i) => i.severity === "error");
  process.stdout.write(`mate-doc lint: ${issues.length} issue(s), ${hasError ? "failed" : "ok"}\n`);
  return hasError ? EXIT.failed : EXIT.ok;
}
