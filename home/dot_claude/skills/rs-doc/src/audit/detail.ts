// Keeps check "detail" strings short, single-line, and free of URL query strings, which can
// carry an SSO session token or a full identity-provider login prompt straight from a CLI's
// stderr (seen in practice from `snow`) into what's otherwise meant to be a one-line summary.
const MAX_DETAIL_LENGTH = 200;
const URL_QUERY_RE = /(https?:\/\/[^\s?]+)\?[^\s]*/g;

export function sanitizeDetail(raw: string): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  const withoutQueries = oneLine.replace(URL_QUERY_RE, "$1?…");
  if (withoutQueries.length <= MAX_DETAIL_LENGTH) return withoutQueries;
  return `${withoutQueries.slice(0, MAX_DETAIL_LENGTH - 1)}…`;
}
