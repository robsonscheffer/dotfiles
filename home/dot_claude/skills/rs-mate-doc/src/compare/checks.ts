import type { CheckSpec, CheckValue } from "./types";

function stripFences(text: string): string {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function countMatches(text: string, pattern: string): number {
  try {
    return [...text.matchAll(new RegExp(pattern, "gu"))].length;
  } catch {
    return -1;
  }
}

function countPhrase(text: string, phrase: string): number {
  if (phrase.length === 0) return 0;
  const hay = text.toLowerCase();
  const needle = phrase.toLowerCase();
  let n = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

function evaluate(text: string, spec: CheckSpec): number {
  switch (spec.kind) {
    case "words":
      return text.split(/\s+/).filter((w) => w.length > 0).length;
    case "count":
      return countMatches(text, spec.pattern);
    case "phrases":
      return spec.list.reduce((sum, p) => sum + countPhrase(text, p), 0);
    case "long_paragraphs":
      return paragraphs(stripFences(text)).filter(
        (p) => p.split("\n").filter((l) => l.trim().length > 0).length > spec.max_lines,
      ).length;
    case "ends_with": {
      const last = paragraphs(text).at(-1);
      if (last === undefined) return 0;
      try {
        return new RegExp(spec.pattern, "iu").test(last) ? 1 : 0;
      } catch {
        return -1;
      }
    }
  }
}

export function runChecks(text: string, specs: CheckSpec[]): CheckValue[] {
  return specs.map((spec) => ({ name: spec.name, value: evaluate(text, spec) }));
}
