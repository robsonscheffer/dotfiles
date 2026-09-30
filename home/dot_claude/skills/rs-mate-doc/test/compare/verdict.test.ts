import { describe, expect, test } from "bun:test";
import { summarize, verdict } from "../../src/compare/verdict";

describe("summarize", () => {
  test("odd and even medians", () => {
    expect(summarize([3, 1, 2])).toEqual({ median: 2, min: 1, max: 3, n: 3 });
    expect(summarize([4, 1, 2, 3])).toEqual({ median: 2.5, min: 1, max: 4, n: 4 });
  });
});

describe("verdict", () => {
  test("B better when lower and lower is better", () => {
    expect(verdict([10, 12], [3, 5], true)).toBe("B better");
  });

  test("B worse when higher and lower is better", () => {
    expect(verdict([3, 5], [10, 12], true)).toBe("B worse");
  });

  test("same when ranges overlap", () => {
    expect(verdict([3, 8], [6, 12], true)).toBe("same");
  });

  test("same when ranges touch", () => {
    expect(verdict([3, 5], [5, 9], true)).toBe("same");
  });

  test("single run when either side has fewer than 2 values", () => {
    expect(verdict([3], [10, 12], true)).toBe("single run");
    expect(verdict([3, 4], [], true)).toBe("single run");
  });

  test("lowerBetter=false flips the direction", () => {
    expect(verdict([1, 0], [1, 1], false)).toBe("same");
    expect(verdict([0, 0], [1, 1], false)).toBe("B better");
    expect(verdict([1, 1], [0, 0], false)).toBe("B worse");
  });
});
