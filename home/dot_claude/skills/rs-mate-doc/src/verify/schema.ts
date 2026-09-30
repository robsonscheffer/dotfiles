// JSON Schema for the verifier's answer, passed to the agent CLI as one JSON string.
export const VERDICT_VALUES = ["supports", "overstates", "contradicts", "unrelated", "uncheckable"] as const;

export const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: [...VERDICT_VALUES] },
    reason: { type: "string" },
    quote: { type: "string" },
  },
  required: ["verdict", "reason", "quote"],
  additionalProperties: false,
} as const;

export function schemaArg(): string {
  return JSON.stringify(VERIFY_SCHEMA);
}
