// The prompt a fresh verifier sees. It gets the claim sentence and the evidence mate-doc
// fetched, and nothing else: no author excerpt, no page text, no path into the doc folder.
import type { Evidence } from "../types.ts";

export function buildPrompt(claimText: string, kind: Evidence["kind"], ref: string, window: string): string {
  return [
    "You are checking one claim from a document against evidence that was fetched for you.",
    "Judge only whether the evidence settles the claim. Use nothing outside the evidence below.",
    "",
    "Verdicts:",
    "- supports: the evidence states or clearly shows what the claim says, with no gap.",
    "- overstates: the evidence supports part of the claim, but the claim says more (a wider scope, a stronger word, a number the evidence does not give).",
    "- contradicts: the evidence says something that conflicts with the claim.",
    "- unrelated: the evidence does not speak to the claim at all.",
    "- uncheckable: the claim is not a statement evidence can settle, for example a reading direction or an opinion.",
    "",
    'Answer with JSON: {"verdict": ..., "reason": ..., "quote": ...}.',
    "reason: one or two plain sentences saying why.",
    "quote: text copied verbatim, character for character, from the evidence below, that your verdict rests on. Do not include the line-number prefixes. Use an empty string only when no text fits.",
    "",
    `Claim: ${claimText}`,
    "",
    `Evidence kind: ${kind}`,
    `Evidence ref: ${ref}`,
    "",
    "Evidence:",
    "<<<EVIDENCE",
    window,
    "EVIDENCE>>>",
    "",
  ].join("\n");
}
