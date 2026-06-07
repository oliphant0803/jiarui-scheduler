export type ExamType = "TEF" | "TCF";
export type Topic = "Listening" | "Speaking" | "Reading" | "Writing";
export type BookingPhase = "phase1" | "gap" | "phase2" | "closed";

export type CalendarSlot = {
  id: string;
  date: Date;
  dayKey: string;
  start: string;
  end: string;
  examType: ExamType | null;
  flexible: boolean;
  status: "available" | "taken" | "mine";
};

export type DaySchedule = {
  day: string;
  offset: number;
  start: string;
  end: string;
  examType: ExamType | null;
};

const TORONTO_TZ = "America/Toronto";
const DAY_MS = 24 * 60 * 60 * 1000;
const dayOffsets = new Map([
  ["monday", 0],
  ["tuesday", 1],
  ["wednesday", 2],
  ["thursday", 3],
  ["friday", 4],
]);

export const topics: Topic[] = ["Listening", "Speaking", "Reading", "Writing"];
export const examTypes: ExamType[] = ["TEF", "TCF"];

export function getCalendarNow() {
  const testNow = process.env.NEXT_PUBLIC_TEST_NOW?.trim();
  if (!testNow || testNow.toLowerCase() === "null") {
    return new Date();
  }

  const parsed = new Date(testNow);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

function torontoParts(date = getCalendarNow()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "long",
  }).formatToParts(date);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
    weekday: value("weekday"),
  };
}

function torontoDateKey(date = getCalendarNow()) {
  const p = torontoParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function currentTorontoDateKey(date = getCalendarNow()) {
  return torontoDateKey(date);
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function addDays(key: string, days: number) {
  const next = new Date(dateFromKey(key).getTime() + days * DAY_MS);
  return next.toISOString().slice(0, 10);
}

function weekdayIndex(date = getCalendarNow()) {
  const p = torontoParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

export function currentTorontoLabel(date = getCalendarNow()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TORONTO_TZ,
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function currentWeekMondayKey(date = getCalendarNow()) {
  const key = torontoDateKey(date);
  const day = weekdayIndex(date);
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(key, mondayOffset);
}

export function nextTargetWeekMondayKey(date = getCalendarNow()) {
  const monday = currentWeekMondayKey(date);
  const p = torontoParts(date);
  const minutes = p.hour * 60 + p.minute;
  return weekdayIndex(date) === 1 && minutes < 12 ? monday : addDays(monday, 7);
}

// Normalise an arbitrary YYYY-MM-DD key to the Monday of the week it falls in.
// Returns null when the key is not a valid date, so callers can fall back to
// their default week instead of trusting tampered query params.
export function weekMondayForKey(key: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (Number.isNaN(date.getTime())) return null;
  return currentWeekMondayKey(date);
}

export function getBookingPhase(date = getCalendarNow()): BookingPhase {
  const day = weekdayIndex(date);
  const p = torontoParts(date);
  const minutes = p.hour * 60 + p.minute;

  if (day === 1 && minutes >= 720) return "phase1";
  if (day === 2) return "phase1";
  if (day === 3 && minutes < 720) return "phase1";
  if (day === 3 && minutes >= 720) return "gap";
  if (day === 4 && minutes < 720) return "gap";
  if (day === 4 && minutes >= 720) return "phase2";
  if (day === 5) return "phase2";
  if (day === 6 && minutes < 720) return "phase2";
  return "closed";
}

export function owlMessage(phase: BookingPhase, loggedIn: boolean) {
  if (!loggedIn) {
    return "Hoot from the perch: log in first, then I can guard your booking from impostor feathers.";
  }
  if (phase === "phase1") {
    return "Hoot! Fair-flight mode is on: pick one slot for the week. Choose the time first, then topic.";
  }
  if (phase === "gap") {
    return "Hoot... the nest is view-only until Thursday noon. Scout the openings, but no swooping yet.";
  }
  if (phase === "phase2") {
    return "Hoot! Leftover-flight mode: you may book up to one slot per day. Friday lets you choose TEF or TCF.";
  }
  return "Hoot after hours: the calendar is readable now, and booking reopens Monday at noon.";
}

export function parseTimeSlotCsv(csv: string): DaySchedule[] {
  return csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith("day,"))
    .flatMap((line) => {
      const [rawDay, ...rawSlots] = line.split(",");
      const day = rawDay.trim();
      const offset = dayOffsets.get(day.toLowerCase());
      if (offset === undefined) {
        throw new Error(`Unknown calendar day in time-slots.csv: ${day}`);
      }

      return rawSlots
        .map((slot) => slot.trim())
        .filter(Boolean)
        .map((slotText) => {
          const match = slotText.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\s+(TEF|TCF|FLEX)$/i);
          if (!match) {
            throw new Error(`Invalid time slot rule for ${day}: ${slotText}`);
          }

          const start = minutesToTime(timeToMinutes(match[1]));
          const end = minutesToTime(timeToMinutes(match[2]));
          if (timeToMinutes(end) - timeToMinutes(start) !== 30) {
            throw new Error(`Each CSV slot must be 30 minutes: ${day} ${slotText}`);
          }

          const examType =
            match[3].toUpperCase() === "FLEX" ? null : (match[3].toUpperCase() as ExamType);
          return {
            day,
            offset,
            start,
            end,
            examType,
          };
        });
    })
    .sort((a, b) => a.offset - b.offset || timeToMinutes(a.start) - timeToMinutes(b.start));
}

export function buildCalendarSlots(
  anchor = getCalendarNow(),
  schedule?: DaySchedule[],
  mondayKey?: string,
): CalendarSlot[] {
  const monday = mondayKey ?? nextTargetWeekMondayKey(anchor);
  const rules =
    schedule ??
    parseTimeSlotCsv(`day,slot 1,slot 2,slot 3,slot 4,slot 5,slot 6
Monday,18:30-19:00 TEF,19:00-19:30 TEF,19:30-20:00 TEF,20:00-20:30 TEF,,
Tuesday,18:30-19:00 TEF,19:00-19:30 TEF,19:30-20:00 TEF,20:00-20:30 TEF,,
Wednesday,18:00-18:30 TCF,18:30-19:00 TCF,19:00-19:30 TCF,19:30-20:00 TCF,20:00-20:30 TCF,20:30-21:00 TCF
Thursday,18:00-18:30 TCF,18:30-19:00 TCF,19:00-19:30 TCF,19:30-20:00 TCF,20:00-20:30 TCF,20:30-21:00 TCF
Friday,18:00-18:30 FLEX,18:30-19:00 FLEX,19:00-19:30 FLEX,19:30-20:00 FLEX,20:00-20:30 FLEX,20:30-21:00 FLEX`);

  return rules.flatMap((rule) => {
    const dayKey = addDays(monday, rule.offset);
    const [year, month, day] = dayKey.split("-").map(Number);
    const startMinutes = timeToMinutes(rule.start);
    const endMinutes = timeToMinutes(rule.end);
    if (endMinutes <= startMinutes) {
      throw new Error(`Slot end must be after start: ${rule.day} ${rule.start}-${rule.end}`);
    }

    return {
      id: `${dayKey}-${rule.start}`,
      date: new Date(Date.UTC(year, month - 1, day, 12)),
      dayKey,
      start: rule.start,
      end: rule.end,
      examType: rule.examType,
      flexible: rule.examType === null,
      status: "available",
    };
  });
}

export function weekRangeLabel(slots: CalendarSlot[]) {
  const first = slots[0]?.date;
  const last = slots[slots.length - 1]?.date;
  if (!first || !last) return "Next week";

  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${fmt.format(first)} - ${fmt.format(last)}`;
}

export function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function dayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
