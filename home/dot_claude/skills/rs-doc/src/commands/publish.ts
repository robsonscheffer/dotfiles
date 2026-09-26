// mate-doc publish <path> --to <target>: a person shares an official, fresh doc.
import { createInterface } from "node:readline/promises";
import { createEnv } from "../env.ts";
import { parse } from "../parser/index.ts";
import { publish } from "../publish/index.ts";
import { render } from "../render/index.ts";
import { EXIT, type Env } from "../types.ts";

const USAGE = "usage: mate-doc publish <path> --to <target>\n";

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} `);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

export async function runPublish(argv: string[], env: Env = createEnv()): Promise<number> {
  const toAt = argv.indexOf("--to");
  const target = toAt >= 0 ? argv[toAt + 1] : undefined;
  const docPath = argv.find((a, i) => !a.startsWith("--") && i !== toAt + 1);
  if (!docPath || !target) {
    process.stderr.write(USAGE);
    return EXIT.usage;
  }

  const result = await publish(
    { docPath, target },
    {
      env,
      parse,
      render,
      fetchImpl: (url, init) => fetch(url, init),
      processEnv: process.env,
      isTTY: Boolean(process.stdin.isTTY),
      confirm,
    },
  );
  const stream = result.code === 0 ? process.stdout : process.stderr;
  stream.write(`mate-doc publish: ${result.message}\n`);
  if (result.url) process.stdout.write(`${result.url}\n`);
  return result.code === 0 ? EXIT.ok : EXIT.failed;
}
