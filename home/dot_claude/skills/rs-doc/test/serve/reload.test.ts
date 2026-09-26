import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { serve } from "../../src/serve/server.ts";
import { addFolder } from "../../src/serve/state.ts";
import { LIVE_RELOAD_PATH } from "../../src/serve/sse.ts";
import type { ServerHandle } from "../../src/types.ts";
import { mkTmpDir, nullLedger, stubParse, stubRenderPlain } from "./util.ts";

let handle: ServerHandle | undefined;

afterEach(async () => {
  await handle?.stop();
  handle = undefined;
});

describe("serve: live reload", () => {
  test("fires a reload event over SSE when a watched file changes", async () => {
    const stateDir = await mkTmpDir("mate-doc-reload-state-");
    const served = await mkTmpDir("mate-doc-reload-served-");
    const pagePath = join(served, "page.md");
    await writeFile(pagePath, "hello");

    const entry = await addFolder(stateDir, served);
    handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });

    // Touch the page once so the server starts watching this folder.
    await fetch(`${handle.url}/${entry.alias}/page`);

    const controller = new AbortController();
    const sseRes = await fetch(`${handle.url}${LIVE_RELOAD_PATH}`, { signal: controller.signal });
    const reader = sseRes.body!.getReader();

    const gotReload = (async () => {
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) return false;
        buffer += decoder.decode(value);
        if (buffer.includes("data: reload")) return true;
      }
    })();

    // Give the SSE connection a beat to register, then edit the file.
    await new Promise((r) => setTimeout(r, 50));
    await writeFile(pagePath, "hello again");

    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000));
    const result = await Promise.race([gotReload, timeout]);
    controller.abort();
    expect(result).toBe(true);
  }, 10000);
});
