import { describe, expect, test } from "bun:test";
import { detectActor, isAgent, isIndependent } from "../../src/identity.ts";

describe("isAgent", () => {
  test("detects each agent env var", () => {
    expect(isAgent({ CLAUDECODE: "1" })).toBe(true);
    expect(isAgent({ CODEX_SANDBOX: "1" })).toBe(true);
    expect(isAgent({ MATE_DOC_AGENT: "x" })).toBe(true);
    expect(isAgent({})).toBe(false);
  });
});

describe("detectActor", () => {
  test("agent:claude with CLAUDECODE", () => {
    expect(detectActor({ CLAUDECODE: "1" }, () => "Alex")).toBe("agent:claude");
  });
  test("agent name from MATE_DOC_AGENT", () => {
    expect(detectActor({ MATE_DOC_AGENT: "x" }, () => "Alex")).toBe("agent:x");
  });
  test("human from the git name", () => {
    expect(detectActor({}, () => "Alex")).toBe("human:Alex");
  });
  test("human:unknown when git has no name", () => {
    expect(detectActor({}, () => "")).toBe("human:unknown");
  });
});

describe("isIndependent", () => {
  test("verifier is independent", () => {
    expect(isIndependent("verifier:sonnet", "human:Sam")).toBe(true);
  });
  test("human is independent unless they are the author", () => {
    expect(isIndependent("human:Sam", "human:Alex")).toBe(true);
    expect(isIndependent("human:Sam", "human:Sam")).toBe(false);
  });
  test("agent is not independent", () => {
    expect(isIndependent("agent:claude", "human:Sam")).toBe(false);
  });
  test("missing value is not independent", () => {
    expect(isIndependent(undefined, "human:Sam")).toBe(false);
    expect(isIndependent("", undefined)).toBe(false);
  });
});
