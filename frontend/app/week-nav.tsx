import Link from "next/link";

import { addDays } from "./calendar-data";

type Props = {
  // Page the nav lives on, e.g. "/reservation" — the selected week is carried
  // in the `week` query param (Monday key) so the server component can refetch.
  basePath: string;
  // Monday key of the week currently shown.
  currentMonday: string;
  // Monday key of the page's default week (the upcoming bookable week).
  defaultMonday: string;
  // Earliest Monday key the user can navigate to.
  minMonday: string;
  // Latest Monday key the user can navigate to.
  maxMonday: string;
  // Human label for the shown week, e.g. "Jun 1 - Jun 5".
  rangeLabel: string;
};

export function WeekNav({
  basePath,
  currentMonday,
  defaultMonday,
  minMonday,
  maxMonday,
  rangeLabel,
}: Props) {
  const prevMonday = addDays(currentMonday, -7);
  const nextMonday = addDays(currentMonday, 7);
  const isDefault = currentMonday === defaultMonday;
  const disablePrev = currentMonday <= minMonday;
  const disableNext = currentMonday >= maxMonday;
  const prevHref = prevMonday < minMonday ? minMonday : prevMonday;
  const nextHref = nextMonday > maxMonday ? maxMonday : nextMonday;

  return (
    <nav className="week-nav" aria-label="Calendar week navigation">
      {disablePrev ? (
        <span className="week-nav-btn is-disabled" aria-disabled="true">
          ← Prev
        </span>
      ) : (
        <Link className="week-nav-btn" href={`${basePath}?week=${prevHref}`} aria-label="Previous week">
          ← Prev
        </Link>
      )}
      <span className="week-nav-range">{rangeLabel}</span>
      {disableNext ? (
        <span className="week-nav-btn is-disabled" aria-disabled="true">
          Next →
        </span>
      ) : (
        <Link className="week-nav-btn" href={`${basePath}?week=${nextHref}`} aria-label="Next week">
          Next →
        </Link>
      )}
      {!isDefault && (
        <Link className="week-nav-reset" href={basePath}>
          Back to current bookable week
        </Link>
      )}
    </nav>
  );
}
