// Watches remembered folders for changes and calls back on every event.
// fs.watch recursive:true works on macOS and Linux under Bun.
import { watch, type FSWatcher } from "node:fs";

export interface Watcher {
  addFolder(path: string): void;
  removeFolder(path: string): void;
  stop(): void;
}

export function createWatcher(onChange: (folder: string) => void): Watcher {
  const watchers = new Map<string, FSWatcher>();

  function addFolder(path: string): void {
    if (watchers.has(path)) return;
    try {
      const w = watch(path, { recursive: true }, () => onChange(path));
      watchers.set(path, w);
    } catch {
      // best-effort: some platforms/paths may not support watching
    }
  }

  function removeFolder(path: string): void {
    const w = watchers.get(path);
    if (w) {
      w.close();
      watchers.delete(path);
    }
  }

  function stop(): void {
    for (const w of watchers.values()) w.close();
    watchers.clear();
  }

  return { addFolder, removeFolder, stop };
}
