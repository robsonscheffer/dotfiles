// Single-quote shell escaping, shared by walk submit (printing the exact gh command for the
// dry-run preview) and walk close (passing env vars to the close hook's shell command).
const SAFE_RE = /^[A-Za-z0-9._/:@=-]+$/;

export function shQuote(value: string): string {
  if (SAFE_RE.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
