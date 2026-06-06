import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildCalendarSlots,
  getCalendarNow,
  parseTimeSlotCsv,
} from "./calendar-data";

export async function loadCalendarSlots(anchor = getCalendarNow()) {
  const csvPath = path.join(process.cwd(), "app", "time-slots.csv");
  const csv = await readFile(csvPath, "utf8");
  return buildCalendarSlots(anchor, parseTimeSlotCsv(csv));
}
