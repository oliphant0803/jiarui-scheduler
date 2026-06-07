import { CalendarViewContent } from "../calendar-view/calendar-view-content";

export default async function CalendarViewPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const requestedWeek = (await searchParams)?.week;
  return <CalendarViewContent requestedWeek={requestedWeek} />;
}
