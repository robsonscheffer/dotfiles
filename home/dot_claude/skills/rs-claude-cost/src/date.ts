// ISO week (Monday to Sunday) boundaries, in local time or UTC.

export type TimeZoneMode = "local" | "UTC";

function mondayOfIsoWeek(year: number, week: number, tz: TimeZoneMode): Date {
  if (tz === "UTC") {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const day = jan4.getUTCDay() || 7; // Monday = 1 .. Sunday = 7
    const week1Monday = new Date(jan4.getTime() - (day - 1) * 86_400_000);
    return new Date(week1Monday.getTime() + (week - 1) * 7 * 86_400_000);
  }
  const jan4 = new Date(year, 0, 4);
  const day = jan4.getDay() || 7;
  const week1Monday = new Date(jan4.getFullYear(), jan4.getMonth(), jan4.getDate() - (day - 1));
  return new Date(
    week1Monday.getFullYear(),
    week1Monday.getMonth(),
    week1Monday.getDate() + (week - 1) * 7,
  );
}

function addDays(date: Date, days: number, tz: TimeZoneMode): Date {
  if (tz === "UTC") return new Date(date.getTime() + days * 86_400_000);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export interface WeekRange {
  isoWeek: string;
  start: Date;
  end: Date;
}

export function parseIsoWeek(isoWeek: string, tz: TimeZoneMode): WeekRange {
  const match = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!match) throw new Error(`bad --week value: ${isoWeek} (expected YYYY-Www)`);
  const year = Number(match[1]);
  const week = Number(match[2]);
  const start = mondayOfIsoWeek(year, week, tz);
  const end = addDays(start, 7, tz);
  return { isoWeek, start, end };
}

/** Standard ISO 8601 week-year and week number for a given date. */
export function isoWeekLabel(date: Date, tz: TimeZoneMode): string {
  const d =
    tz === "UTC"
      ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
      : new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = (tz === "UTC" ? d.getUTCDay() : d.getDay()) || 7;
  const thursdayOffset = 4 - dayNum;
  const thursday =
    tz === "UTC"
      ? new Date(d.getTime() + thursdayOffset * 86_400_000)
      : new Date(d.getFullYear(), d.getMonth(), d.getDate() + thursdayOffset);
  const year = tz === "UTC" ? thursday.getUTCFullYear() : thursday.getFullYear();
  const jan1 = tz === "UTC" ? new Date(Date.UTC(year, 0, 1)) : new Date(year, 0, 1);
  const diffDays = Math.round((thursday.getTime() - jan1.getTime()) / 86_400_000);
  const week = Math.floor(diffDays / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The most recent Monday-to-Sunday week that has already ended. */
export function lastCompletedWeek(now: Date, tz: TimeZoneMode): WeekRange {
  const currentLabel = isoWeekLabel(now, tz);
  const { start: currentWeekStart } = parseIsoWeek(currentLabel, tz);
  const start = addDays(currentWeekStart, -7, tz);
  const end = currentWeekStart;
  return { isoWeek: isoWeekLabel(start, tz), start, end };
}

/** "Sep 21 to Sep 27" for a report window whose end is exclusive. */
export function windowLabel(window: { start: string; end: string; tz: string }): string {
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: window.tz === "UTC" ? "UTC" : undefined,
    });
  return `${fmt(Date.parse(window.start))} to ${fmt(Date.parse(window.end) - 1)}`;
}
