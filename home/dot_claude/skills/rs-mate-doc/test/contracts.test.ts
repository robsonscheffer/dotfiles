import { describe, expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import schema from "../schema/claims.schema.json";
import { main } from "../src/cli.ts";
import { COMMANDS, DIRECTIVES, EXIT, RAW_DIRECTIVES, type Ledger } from "../src/types.ts";

const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(schema);
const example = Bun.YAML.parse(
  await Bun.file(new URL("./fixtures/contracts/claims.example.yaml", import.meta.url)).text(),
) as Omit<Ledger, "path">;

const clone = <T>(v: T): T => structuredClone(v);

describe("claims schema", () => {
  test("accepts the reference ledger", () => {
    expect(validate(example)).toBe(true);
  });

  test("keeps ISO dates as strings", () => {
    expect(typeof example.claims[0]?.checked_at).toBe("string");
  });

  test("rejects not_verified without an owner", () => {
    const bad = clone(example);
    delete bad.claims[3]!.owner;
    expect(validate(bad)).toBe(false);
  });

  test("rejects verified without evidence", () => {
    const bad = clone(example);
    delete bad.claims[0]!.evidence;
    expect(validate(bad)).toBe(false);
  });

  test("rejects a code ref without a line number", () => {
    const bad = clone(example);
    (bad.claims[0]!.evidence as { ref: string }).ref = "acme/web@origin/main:src/analytics/label.ts";
    expect(validate(bad)).toBe(false);
  });

  test("rejects an mcp claim that needs a non-mcp capability", () => {
    const bad = clone(example);
    (bad.claims[2]!.evidence as { needs: string }).needs = "http";
    expect(validate(bad)).toBe(false);
  });

  test("rejects a malformed claim id", () => {
    const bad = clone(example);
    (bad.claims[0] as { id: string }).id = "claim-7";
    expect(validate(bad)).toBe(false);
  });

  test("rejects an unknown verdict", () => {
    const bad = clone(example);
    (bad.claims[0] as { verdict: string }).verdict = "probably";
    expect(validate(bad)).toBe(false);
  });
});

describe("contract constants", () => {
  test("raw directives are known directives", () => {
    for (const d of RAW_DIRECTIVES) expect(DIRECTIVES).toContain(d);
  });

  test("exit codes are distinct", () => {
    expect(new Set(Object.values(EXIT)).size).toBe(Object.keys(EXIT).length);
  });
});

describe("cli dispatch", () => {
  test("publish and walk are not built yet", async () => {
    expect(await main(["publish"])).toBe(EXIT.usage);
    expect(await main(["walk"])).toBe(EXIT.usage);
  });

  test("commands requiring a path report usage when none is given", async () => {
    const needsPath = COMMANDS.filter(
      (c) => !["setup", "publish", "walk", "status", "help"].includes(c),
    );
    for (const cmd of needsPath) {
      expect(await main([cmd])).toBe(EXIT.usage);
    }
  });

  test("unknown command is a usage error", async () => {
    expect(await main(["frobnicate"])).toBe(EXIT.usage);
  });

  test("--help succeeds", async () => {
    expect(await main(["--help"])).toBe(EXIT.ok);
  });
});
