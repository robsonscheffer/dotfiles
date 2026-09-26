// `mate-doc open <path>`: remember the folder, make sure the viewer is running (detached), and
// open the browser at the right page.
import { parse } from "../parser/index.ts";
import { render } from "../render/index.ts";
import { openPath } from "../serve/open.ts";
import { loadLedgerSync } from "../serve/ledger-sync.ts";
import { defaultStateDir } from "../serve/state.ts";
import { EXIT } from "../types.ts";

const DEFAULT_PORT = 52012;

function openBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === "darwin") Bun.spawn({ cmd: ["open", url], stdout: "ignore", stderr: "ignore" });
    else if (platform === "win32") Bun.spawn({ cmd: ["cmd", "/c", "start", url], stdout: "ignore", stderr: "ignore" });
    else Bun.spawn({ cmd: ["xdg-open", url], stdout: "ignore", stderr: "ignore" });
  } catch {
    // best effort: printing the URL below is the fallback.
  }
}

export async function runOpen(argv: string[]): Promise<number> {
  const [target] = argv;
  if (!target) {
    process.stderr.write("mate-doc open: usage: mate-doc open <path>\n");
    return EXIT.usage;
  }

  const stateDir = defaultStateDir();
  const port = Number(process.env.MATE_DOC_PORT ?? DEFAULT_PORT);

  try {
    const result = await openPath(target, {
      stateDir,
      port,
      parse,
      render,
      loadLedger: loadLedgerSync,
      openBrowser,
    });
    process.stdout.write(`${result.url}\n`);
    return EXIT.ok;
  } catch (err) {
    process.stderr.write(`mate-doc open: ${(err as Error).message}\n`);
    return EXIT.usage;
  }
}
