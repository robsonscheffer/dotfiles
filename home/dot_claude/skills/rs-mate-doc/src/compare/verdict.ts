import type { CheckVerdict } from "./types";

export interface Summary { median: number; min: number; max: number; n: number }

export function summarize(values: number[]): Summary {
  const n = values.length;
  if (n === 0) return { median: 0, min: 0, max: 0, n: 0 };
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  return { median, min: s[0]!, max: s[n - 1]!, n };
}

export function verdict(base: number[], b: number[], lowerBetter: boolean): CheckVerdict {
  if (base.length < 2 || b.length < 2) return "single run";
  const x = summarize(base);
  const y = summarize(b);
  if (y.min <= x.max && x.min <= y.max) return "same";
  const bLower = y.max < x.min;
  return bLower === lowerBetter ? "B better" : "B worse";
}
