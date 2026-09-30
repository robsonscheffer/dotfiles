// Builds the argv for the three compare panes. A is the everyday agent; A-base and B drop
// user settings and append a rules file, so they differ only in which file is appended.
import { PANES, type CompareConfig, type Pane, type PaneName } from "./types.ts";

export interface PaneOptions {
  basePath: string;
  bPath: string;
  model?: string;
}

export function paneCommands(cfg: CompareConfig, opts: PaneOptions): Pane[] {
  const model = opts.model ? ["--model", opts.model] : [];
  const argvFor = (name: PaneName): string[] => {
    if (name === "A") return [...cfg.command, ...model];
    const path = name === "A-base" ? opts.basePath : opts.bPath;
    return [...cfg.command, ...cfg.isolateFlags, cfg.systemFlag, path, ...model];
  };
  return PANES.map((name) => ({ name, argv: argvFor(name) }));
}
