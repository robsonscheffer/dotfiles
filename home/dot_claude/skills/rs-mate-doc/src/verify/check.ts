// The mechanical check that runs before any agent call: does the fetched evidence still
// match what the author wrote down? Same comparisons as audit; copied so audit stays untouched.
import type { Evidence } from "../types.ts";
import type { FetchResult } from "./fetch.ts";

function getField(record: unknown, dottedPath: string): unknown {
  return dottedPath.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, record);
}

function withinTolerance(actual: unknown, expect: number | string, tolerance?: number): boolean {
  if (typeof expect === "number") {
    const n = typeof actual === "number" ? actual : Number(actual);
    if (Number.isNaN(n)) return false;
    return Math.abs(n - expect) <= (tolerance ?? 0);
  }
  return String(actual) === expect;
}

export function mechanicalCheck(ev: Evidence, fetched: Extract<FetchResult, { ok: true }>): boolean {
  switch (ev.kind) {
    case "code":
      return fetched.raw.includes(ev.excerpt);
    case "link":
      return !ev.excerpt || fetched.raw.includes(ev.excerpt);
    case "query": {
      const rows = fetched.rows ?? [];
      if (ev.expect.rows !== undefined && rows.length !== ev.expect.rows) return false;
      if (ev.expect.value !== undefined) {
        const first = rows[0];
        const actual = first ? Object.values(first)[0] : undefined;
        return withinTolerance(actual, ev.expect.value, ev.expect.tolerance);
      }
      return true;
    }
    case "record": {
      const actual = getField(fetched.record, ev.field);
      return typeof ev.expect === "boolean"
        ? actual === ev.expect
        : withinTolerance(actual, ev.expect as number | string);
    }
    case "mcp":
      return false;
  }
}
