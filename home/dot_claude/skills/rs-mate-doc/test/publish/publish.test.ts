import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { publish } from "../../src/publish/index.ts";
import { existingPublishedEntry } from "../../src/publish/state.ts";
import {
  baseDeps,
  cleanupTempDirs,
  DEFAULT_ADAPTERS_YAML,
  fakeEnv,
  fakeFetchOk,
  GOOD_CLAIM,
  recordingFetch,
  SLACK_CLAIM,
  tempDir,
  writeAdapters,
  writeClaimsYaml,
  writeOfficialDoc,
} from "./helpers.ts";

afterEach(cleanupTempDirs);

// An Env whose fetch matches GOOD_CLAIM's excerpt, so gate/audit pass for the happy paths.
function pricingEnv() {
  return fakeEnv({ fetch: async () => ({ status: 200, body: "Self-serve pricing starts at $40/month." }) });
}

async function setup(): Promise<{ docDir: string; stateDir: string; adaptersPath: string }> {
  const docDir = await tempDir();
  const configDir = await tempDir();
  const stateDir = await tempDir();
  const adaptersPath = await writeAdapters(configDir, DEFAULT_ADAPTERS_YAML);
  return { docDir, stateDir, adaptersPath };
}

describe("rule 1: target must exist", () => {
  test("refuses an unknown target", async () => {
    const { docDir, stateDir, adaptersPath } = await setup();
    await writeClaimsYaml(docDir, [GOOD_CLAIM]);
    await writeOfficialDoc(docDir);
    const result = await publish(
      { docPath: docDir, target: "nope" },
      baseDeps({ env: pricingEnv(), processEnv: { MATE_DOC_ADAPTERS: adaptersPath, MATE_DOC_STATE_DIR: stateDir } }),
    );
    expect(result.code).toBe(1);
    expect(result.message).toContain('target "nope" is not configured');
  });
});

describe("rule 2: target must be verified", () => {
  test("refuses an unverified target", async () => {
    const { docDir, stateDir, adaptersPath } = await setup();
    await writeClaimsYaml(docDir, [GOOD_CLAIM]);
    await writeOfficialDoc(docDir);
    const result = await publish(
      { docPath: docDir, target: "unverified" },
      baseDeps({ env: pricingEnv(), processEnv: { MATE_DOC_ADAPTERS: adaptersPath, MATE_DOC_STATE_DIR: stateDir } }),
    );
    expect(result.code).toBe(1);
    expect(result.message).toContain("is not verified");
  });
});

describe("rule 3: doc must be official with a matching ledger_hash", () => {
  test("refuses a draft doc", async () => {
    const { docDir, stateDir, adaptersPath } = await setup();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(docDir, "index.md"), "---\ntitle: Draft\n---\n\nNot official yet.\n");
    await writeClaimsYaml(docDir, []);
    const result = await publish(
      { docPath: docDir, target: "share" },
      baseDeps({ env: pricingEnv(), processEnv: { MATE_DOC_ADAPTERS: adaptersPath, MATE_DOC_STATE_DIR: stateDir } }),
    );
    expect(result.code).toBe(1);
    expect(result.message).toContain("is not official");
  });

  test("refuses when the ledger_hash no longer matches the page", async () => {
    const { docDir, stateDir, adaptersPath } = await setup();
    const path = await writeOfficialDoc(docDir);
    await writeClaimsYaml(docDir, [GOOD_CLAIM]);
    // Edit the page after approval without updating ledger_hash.
    const current = await readFile(path, "utf8");
    await (await import("node:fs/promises")).writeFile(path, current.replace("Pricing note.", "Pricing note, edited."));
    const result = await publish(
      { docPath: docDir, target: "share" },
      baseDeps({ env: pricingEnv(), processEnv: { MATE_DOC_ADAPTERS: adaptersPath, MATE_DOC_STATE_DIR: stateDir } }),
    );
    expect(result.code).toBe(1);
    expect(result.message).toContain("ledger_hash no longer matches");
  });
});

describe("rule 4: gate must pass and freshness must hold", () => {
  test("refuses when a claim is not_verified without an owner", async () => {
    const { docDir, stateDir, adaptersPath } = await setup();
    await writeClaimsYaml(docDir, [{ id: "C1", claim: "Unowned.", status: "not_verified" }]);
    await writeOfficialDoc(docDir);
    const result = await publish(
      { docPath: docDir, target: "share" },
      baseDeps({ env: pricingEnv(), processEnv: { MATE_DOC_ADAPTERS: adaptersPath, MATE_DOC_STATE_DIR: stateDir } }),
    );
    expect(result.code).toBe(1);
    expect(result.message).toContain("does not pass gate");
    expect(result.message).toContain("no owner");
  });
});

describe("rule 5: egress", () => {
  test("refuses a company mcp claim to a target that is not company_ok", async () => {
    const { docDir, stateDir, adaptersPath } = await setup();
    await writeClaimsYaml(docDir, [SLACK_CLAIM]);
    await writeOfficialDoc(docDir, { claimRefs: ["C2"] });
    const result = await publish(
      { docPath: docDir, target: "external" },
      baseDeps({ env: fakeEnv(), processEnv: { MATE_DOC_ADAPTERS: adaptersPath, MATE_DOC_STATE_DIR: stateDir } }),
    );
    expect(result.code).toBe(1);
    expect(result.message).toContain("cannot receive company-provenance evidence");
    expect(result.message).toContain("mcp:slack");
  });

  test("allows the same doc to a company_ok target", async () => {
    const { docDir, stateDir, adaptersPath } = await setup();
    await writeClaimsYaml(docDir, [SLACK_CLAIM]);
    await writeOfficialDoc(docDir, { claimRefs: ["C2"] });
    const result = await publish(
      { docPath: docDir, target: "share" },
      baseDeps({ env: fakeEnv(), processEnv: { MATE_DOC_ADAPTERS: adaptersPath, MATE_DOC_STATE_DIR: stateDir } }),
    );
    expect(result.code).toBe(0);
  });

  test("a company host in frontmatter sources also triggers egress", async () => {
    const { docDir, stateDir, adaptersPath } = await setup();
    await writeClaimsYaml(docDir, [GOOD_CLAIM]);
    await writeOfficialDoc(docDir, { sources: ["https://example.internal/handbook"] });
    const result = await publish(
      { docPath: docDir, target: "external" },
      baseDeps({ env: pricingEnv(), processEnv: { MATE_DOC_ADAPTERS: adaptersPath, MATE_DOC_STATE_DIR: stateDir } }),
    );
    expect(result.code).toBe(1);
    expect(result.message).toContain("cannot receive company-provenance evidence");
    expect(result.message).toContain("example.internal");
  });
});

describe("rule 6: confirmation gate", () => {
  test("refuses when stdin is not a TTY", async () => {
    const { docDir, stateDir, adaptersPath } = await setup();
    await writeClaimsYaml(docDir, [GOOD_CLAIM]);
    await writeOfficialDoc(docDir);
    const result = await publish(
      { docPath: docDir, target: "share" },
      baseDeps({
        env: pricingEnv(),
        isTTY: false,
        processEnv: { MATE_DOC_ADAPTERS: adaptersPath, MATE_DOC_STATE_DIR: stateDir },
      }),
    );
    expect(result.code).toBe(1);
    expect(result.message).toContain("not a TTY");
  });

  for (const agentVar of ["CLAUDECODE", "CODEX_SANDBOX", "MATE_DOC_AGENT"]) {
    test(`refuses when ${agentVar} is set`, async () => {
      const { docDir, stateDir, adaptersPath } = await setup();
      await writeClaimsYaml(docDir, [GOOD_CLAIM]);
      await writeOfficialDoc(docDir);
      let confirmCalled = false;
      const result = await publish(
        { docPath: docDir, target: "share" },
        baseDeps({
          env: pricingEnv(),
          confirm: async () => {
            confirmCalled = true;
            return true;
          },
          processEnv: { MATE_DOC_ADAPTERS: adaptersPath, MATE_DOC_STATE_DIR: stateDir, [agentVar]: "1" },
        }),
      );
      expect(result.code).toBe(1);
      expect(result.message).toContain(agentVar);
      expect(confirmCalled).toBe(false);
    });
  }

  test("refuses when the human declines the prompt", async () => {
    const { docDir, stateDir, adaptersPath } = await setup();
    await writeClaimsYaml(docDir, [GOOD_CLAIM]);
    await writeOfficialDoc(docDir);
    const result = await publish(
      { docPath: docDir, target: "share" },
      baseDeps({
        env: pricingEnv(),
        confirm: async () => false,
        processEnv: { MATE_DOC_ADAPTERS: adaptersPath, MATE_DOC_STATE_DIR: stateDir },
      }),
    );
    expect(result.code).toBe(1);
    expect(result.message).toContain("cancelled");
  });
});

describe("rule 7: build and send", () => {
  test("creates on first publish, then updates reusing slug and owner_key, and never writes the key into the doc folder", async () => {
    const { docDir, stateDir, adaptersPath } = await setup();
    await writeClaimsYaml(docDir, [GOOD_CLAIM]);
    await writeOfficialDoc(docDir);
    const payload = { url: "https://share.example.test/d/abc123", slug: "abc123", owner_key: "very-secret-owner-key" };
    const { fetch, calls } = recordingFetch(payload);
    const processEnv = { MATE_DOC_ADAPTERS: adaptersPath, MATE_DOC_STATE_DIR: stateDir };

    const first = await publish(
      { docPath: docDir, target: "share" },
      baseDeps({ env: pricingEnv(), fetchImpl: fetch, processEnv }),
    );
    expect(first.code).toBe(0);
    expect(first.slug).toBe("abc123");
    expect(first.message).toContain("owner key ...-key");
    expect(first.message).not.toContain("very-secret-owner-key");

    const firstBody = JSON.parse(calls[0]!.body);
    expect(firstBody.params.name).toBe("share");
    expect(firstBody.params.arguments.slug).toBeUndefined();

    const stored = await existingPublishedEntry(stateDir, docDir, "share");
    expect(stored?.slug).toBe("abc123");
    expect(stored?.owner_key).toBe("very-secret-owner-key");

    const second = await publish(
      { docPath: docDir, target: "share" },
      baseDeps({ env: pricingEnv(), fetchImpl: fetch, processEnv }),
    );
    expect(second.code).toBe(0);
    expect(second.slug).toBe("abc123");

    const secondBody = JSON.parse(calls[1]!.body);
    expect(secondBody.params.name).toBe("update");
    expect(secondBody.params.arguments.slug).toBe("abc123");
    expect(secondBody.params.arguments.owner_key).toBe("very-secret-owner-key");

    // The owner key must never land inside the doc folder itself.
    const { readdir } = await import("node:fs/promises");
    async function walk(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...(await walk(full)));
        else files.push(full);
      }
      return files;
    }
    for (const file of await walk(docDir)) {
      const contents = await readFile(file, "utf8");
      expect(contents.includes("very-secret-owner-key")).toBe(false);
    }
  });

  test("refuses when the share tool reports an error", async () => {
    const { docDir, stateDir, adaptersPath } = await setup();
    await writeClaimsYaml(docDir, [GOOD_CLAIM]);
    await writeOfficialDoc(docDir);
    const result = await publish(
      { docPath: docDir, target: "share" },
      baseDeps({
        env: pricingEnv(),
        fetchImpl: async () => ({
          status: 200,
          text: async () =>
            JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ text: "quota exceeded" }] } }),
        }),
        processEnv: { MATE_DOC_ADAPTERS: adaptersPath, MATE_DOC_STATE_DIR: stateDir },
      }),
    );
    expect(result.code).toBe(1);
    expect(result.message).toContain("failed");
  });
});
