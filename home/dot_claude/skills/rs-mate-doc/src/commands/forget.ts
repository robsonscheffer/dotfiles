// `mate-doc forget <folder>`: stop serving a remembered folder.
import { forgetFolder, defaultStateDir } from "../serve/state.ts";
import { EXIT } from "../types.ts";

export async function runForget(argv: string[]): Promise<number> {
  const [folder] = argv;
  if (!folder) {
    process.stderr.write("mate-doc forget: usage: mate-doc forget <folder>\n");
    return EXIT.usage;
  }
  const stateDir = defaultStateDir();
  const removed = await forgetFolder(stateDir, folder);
  process.stdout.write(
    removed ? `mate-doc forget: removed ${folder}\n` : `mate-doc forget: not found: ${folder}\n`,
  );
  return EXIT.ok;
}
