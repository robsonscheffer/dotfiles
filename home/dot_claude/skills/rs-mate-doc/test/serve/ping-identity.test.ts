// pingIdentity must normalize the state dir before hashing: a trailing slash or a symlink to
// the same dir should not make `open` mistake its own server for someone else's.
import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { pingIdentity } from "../../src/serve/server.ts";
import { mkTmpDir } from "./util.ts";

describe("serve: ping identity", () => {
  test("a trailing slash does not change the identity", async () => {
    const dir = await mkTmpDir("mate-doc-ping-slash-");
    expect(pingIdentity(`${dir}/`)).toBe(pingIdentity(dir));
  });

  test("a symlink to the same dir shares its identity", async () => {
    const parent = await mkTmpDir("mate-doc-ping-symlink-");
    const real = join(parent, "real");
    const link = join(parent, "link");
    await Bun.write(join(real, ".keep"), "");
    await symlink(real, link);
    expect(pingIdentity(link)).toBe(pingIdentity(real));
  });

  test("two distinct dirs get different identities", async () => {
    const a = await mkTmpDir("mate-doc-ping-a-");
    const b = await mkTmpDir("mate-doc-ping-b-");
    expect(pingIdentity(a)).not.toBe(pingIdentity(b));
  });
});
