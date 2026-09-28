// Fence info string parsing: "ts title=x.ts" -> lang "ts", meta { title: "x.ts" }.

export function parseFenceInfo(info: string): { lang: string | undefined; meta: Record<string, string> } {
  const trimmed = info.trim();
  if (trimmed.length === 0) return { lang: undefined, meta: {} };

  const parts = trimmed.split(/\s+/);
  const lang = parts[0];
  const meta: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq);
    let value = part.slice(eq + 1);
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (key.length > 0) meta[key] = value;
  }
  return { lang, meta };
}
