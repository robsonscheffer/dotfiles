// `mate-doc new <path> --shape plain|guide|brief|dashboard`: copy a shape skeleton to <path>. Refuses to
// overwrite anything that already exists. `--shape walk` is not a buildable shape: it points at
// the `walk` command instead.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { detectActor } from "../identity.ts";
import { EXIT } from "../types.ts";

const SHAPES_ROOT = new URL("../shapes/", import.meta.url);

function shapePath(shape: string): string {
  return new URL(shape + "/", SHAPES_ROOT).pathname;
}

function copyRecursive(src: string, dest: string): void {
  const st = statSync(src);
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(src)) copyRecursive(join(src, name), join(dest, name));
  } else {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

export async function runNew(argv: string[]): Promise<number> {
  const [path, ...rest] = argv;
  const shapeIdx = rest.indexOf("--shape");
  const shape = shapeIdx !== -1 ? rest[shapeIdx + 1] : undefined;

  if (!path || !shape) {
    process.stderr.write("mate-doc new: usage: mate-doc new <path> --shape plain|guide|brief|dashboard\n");
    return EXIT.usage;
  }

  if (shape === "walk") {
    process.stdout.write("use mate-doc walk\n");
    return EXIT.usage;
  }

  if (shape !== "plain" && shape !== "guide" && shape !== "brief" && shape !== "dashboard") {
    process.stderr.write(`mate-doc new: unknown shape "${shape}"\n`);
    return EXIT.usage;
  }

  if (existsSync(path)) {
    process.stderr.write(`mate-doc new: refusing to overwrite ${path}\n`);
    return EXIT.usage;
  }

  if (shape === "plain") {
    copyRecursive(join(shapePath("plain"), "plain.md"), path);
    process.stdout.write(`mate-doc new: wrote ${path}\n`);
    return EXIT.ok;
  }

  copyRecursive(shapePath(shape), path);
  const ledgerPath = join(path, "claims.yaml");
  if (existsSync(ledgerPath)) {
    const raw = readFileSync(ledgerPath, "utf8");
    writeFileSync(ledgerPath, raw.replace(/^author:.*$/m, () => `author: ${detectActor()}`));
  }
  process.stdout.write(`mate-doc new: wrote ${path}/\n`);
  return EXIT.ok;
}
