// history.jsonl (one row per week's totals) and findings.jsonl (one row per
// finding that fired that week). Re-running a week replaces its rows;
// --no-record skips both files entirely.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isoWeekLabel, parseIsoWeek, type TimeZoneMode } from "./date.ts";
import type { Finding, SinceLastWeekRow, Totals } from "./types.ts";

export interface HistoryRow {
  isoWeek: string;
  totalDollars: number;
  sessions: number;
  turns: number;
  recordedAt: string;
}

export interface FindingsRow {
  isoWeek: string;
  rule: string;
  title: string;
  dollars: number;
  recordedAt: string;
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

function writeJsonl<T>(path: string, rows: T[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
}

export function historyPath(outDir: string): string {
  return `${outDir}/history.jsonl`;
}

export function findingsPath(outDir: string): string {
  return `${outDir}/findings.jsonl`;
}

/** Replaces this week's row in history.jsonl and this week's rows in findings.jsonl. */
export function recordWeek(
  outDir: string,
  isoWeek: string,
  totals: Totals,
  findings: Finding[],
  now: Date = new Date(),
): void {
  const hPath = historyPath(outDir);
  const history = readJsonl<HistoryRow>(hPath).filter((r) => r.isoWeek !== isoWeek);
  history.push({
    isoWeek,
    totalDollars: totals.dollars,
    sessions: totals.sessions,
    turns: totals.turns,
    recordedAt: now.toISOString(),
  });
  history.sort((a, b) => a.isoWeek.localeCompare(b.isoWeek));
  writeJsonl(hPath, history);

  const fPath = findingsPath(outDir);
  const rows = readJsonl<FindingsRow>(fPath).filter((r) => r.isoWeek !== isoWeek);
  for (const finding of findings) {
    rows.push({
      isoWeek,
      rule: finding.rule,
      title: finding.title,
      dollars: finding.dollars,
      recordedAt: now.toISOString(),
    });
  }
  rows.sort((a, b) => a.isoWeek.localeCompare(b.isoWeek) || a.rule.localeCompare(b.rule));
  writeJsonl(fPath, rows);
}

function previousIsoWeek(isoWeek: string, tz: TimeZoneMode): string {
  const { start } = parseIsoWeek(isoWeek, tz);
  const prevStart = new Date(start.getTime() - 7 * 86_400_000);
  return isoWeekLabel(prevStart, tz);
}

/** Every rule that fired the previous week, with its value then, its value now, and a direction. */
export function buildSinceLastWeek(
  outDir: string,
  isoWeek: string,
  tz: TimeZoneMode,
  currentFindings: Finding[],
): SinceLastWeekRow[] {
  const prevWeek = previousIsoWeek(isoWeek, tz);
  const rows = readJsonl<FindingsRow>(findingsPath(outDir)).filter((r) => r.isoWeek === prevWeek);
  if (rows.length === 0) return [];

  const currentByRule = new Map(currentFindings.map((f) => [f.rule, f]));
  return rows.map((prev) => {
    const now = currentByRule.get(prev.rule);
    const metricNow = now?.dollars ?? 0;
    const direction = metricNow > prev.dollars ? "up" : metricNow < prev.dollars ? "down" : "same";
    return {
      rule: prev.rule,
      title: now?.title ?? prev.title,
      metricThen: prev.dollars,
      metricNow,
      direction,
    };
  });
}

/** Whether history.jsonl has at least one week recorded before this one. */
export function hasPriorWeek(outDir: string, isoWeek: string): boolean {
  return readJsonl<HistoryRow>(historyPath(outDir)).some((r) => r.isoWeek < isoWeek);
}

/** The immediately preceding week's total, if history.jsonl has one recorded. */
export function previousWeekTotal(outDir: string, isoWeek: string, tz: TimeZoneMode): number | null {
  const prevWeek = previousIsoWeek(isoWeek, tz);
  const row = readJsonl<HistoryRow>(historyPath(outDir)).find((r) => r.isoWeek === prevWeek);
  return row?.totalDollars ?? null;
}
