// `mate-doc gate <path>`: print each reason, then a one-line summary. Writes the new level into
// frontmatter only for a draft -> audited promotion, or a demotion.
import { readFile, stat, writeFile } from "node:fs/promises";
import { createEnv } from "../env.ts";
import { gate } from "../gate/index.ts";
import { findPrimaryMarkdown, setFrontmatterFields } from "./shared.ts";
import { EXIT, type Env, type Level } from "../types.ts";

const LEVEL_RANK: Record<Level, number> = { draft: 0, audited: 1, official: 2 };

async function writeLevel(target: string, isDir: boolean, level: Level): Promise<void> {
  const mdPath = isDir ? await findPrimaryMarkdown(target) : target;
  if (!mdPath) return;
  const raw = await readFile(mdPath, "utf8");
  await writeFile(mdPath, setFrontmatterFields(raw, { status: level }), "utf8");
}

export async function runGate(argv: string[], env: Env = createEnv()): Promise<number> {
  const [target] = argv;
  if (!target) {
    process.stderr.write("mate-doc gate: usage: mate-doc gate <path>\n");
    return EXIT.usage;
  }
  const st = await stat(target).catch(() => null);
  if (!st) {
    process.stderr.write(`mate-doc gate: no such file or folder: ${target}\n`);
    return EXIT.usage;
  }

  const result = await gate(target, env);

  for (const r of result.reasons) {
    process.stdout.write(`${r.path}:${r.pos.start.line}:${r.pos.start.column} ${r.message}\n`);
  }
  process.stdout.write(
    `mate-doc gate: ${result.pass ? "pass" : "fail"} (${result.levelBefore} -> ${result.levelAfter}), ` +
      `${result.summary.claims} claims, ${result.summary.verified} verified, ${result.summary.open} open, ${result.summary.stale} stale\n`,
  );

  const isDraftToAudited = result.levelBefore === "draft" && result.levelAfter === "audited";
  const isDemotion = LEVEL_RANK[result.levelAfter] < LEVEL_RANK[result.levelBefore];
  if (result.levelBefore !== result.levelAfter && (isDraftToAudited || isDemotion)) {
    await writeLevel(target, st.isDirectory(), result.levelAfter);
  }

  return result.pass ? EXIT.ok : EXIT.failed;
}
