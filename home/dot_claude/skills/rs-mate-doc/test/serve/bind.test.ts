import { describe, expect, test } from "bun:test";
import { serve } from "../../src/serve/server.ts";
import { mkTmpDir, nullLedger, stubParse, stubRenderPlain } from "./util.ts";
import type { ServeOptions } from "../../src/types.ts";

describe("serve: loopback-only bind", () => {
  test("binds 127.0.0.1 and serves on the returned url", async () => {
    const stateDir = await mkTmpDir("mate-doc-bind-");
    const handle = await serve({
      host: "127.0.0.1",
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    });
    try {
      expect(handle.url.startsWith("http://127.0.0.1:")).toBe(true);
      const res = await fetch(`${handle.url}/`);
      expect(res.status).toBe(200);
    } finally {
      await handle.stop();
    }
  });

  test("refuses to bind a non-loopback host", async () => {
    const stateDir = await mkTmpDir("mate-doc-bind-");
    const bad: ServeOptions = {
      host: "0.0.0.0" as ServeOptions["host"],
      port: 0,
      stateDir,
      parse: stubParse,
      render: stubRenderPlain,
      loadLedger: nullLedger,
    };
    await expect(serve(bad)).rejects.toThrow(/loopback/i);
  });
});
