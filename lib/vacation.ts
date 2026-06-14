export type VacationFields = {
  vacation_mode?: boolean | null;
  vacation_message?: string | null;
  vacation_starts_at?: string | null;
  vacation_ends_at?: string | null;
};

/**
 * Effective "seller is paused" state. Two ways to be on vacation:
 *  - **Basic pause** (free): the `vacation_mode` manual toggle is on.
 *  - **Scheduled pause** (Pro): now() falls within the start/end window.
 *
 * A scheduled window is considered active when both bounds are satisfied; an
 * open bound (null start or null end) is treated as unbounded on that side, so
 * setting only an end date pauses immediately until that date.
 *
 * Pure function over already-fetched profile fields so list/grid contexts can
 * filter many sellers without an extra query per row.
 */
export function isOnVacation(p: VacationFields | null | undefined, now: Date = new Date()): boolean {
  if (!p) return false;
  if (p.vacation_mode) return true;

  const start = p.vacation_starts_at ? new Date(p.vacation_starts_at) : null;
  const end   = p.vacation_ends_at   ? new Date(p.vacation_ends_at)   : null;
  if (!start && !end) return false;

  const afterStart = !start || start <= now;
  const beforeEnd  = !end   || now <= end;
  return afterStart && beforeEnd;
}

/** When the current pause is scheduled to lift, if a future end date is set. */
export function vacationReturnDate(p: VacationFields | null | undefined): Date | null {
  if (!p?.vacation_ends_at) return null;
  const end = new Date(p.vacation_ends_at);
  return Number.isNaN(end.getTime()) ? null : end;
}
