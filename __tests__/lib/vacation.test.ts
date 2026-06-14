import { isOnVacation, vacationReturnDate } from "@/lib/vacation";

describe("isOnVacation", () => {
  const now = new Date("2026-06-14T12:00:00Z");

  it("returns false for null/empty profiles", () => {
    expect(isOnVacation(null, now)).toBe(false);
    expect(isOnVacation({}, now)).toBe(false);
  });

  it("returns true when the basic manual toggle is on", () => {
    expect(isOnVacation({ vacation_mode: true }, now)).toBe(true);
  });

  it("returns true inside a scheduled window", () => {
    expect(isOnVacation({
      vacation_starts_at: "2026-06-10T00:00:00Z",
      vacation_ends_at:   "2026-06-20T00:00:00Z",
    }, now)).toBe(true);
  });

  it("returns false before a scheduled window starts", () => {
    expect(isOnVacation({
      vacation_starts_at: "2026-06-20T00:00:00Z",
      vacation_ends_at:   "2026-06-25T00:00:00Z",
    }, now)).toBe(false);
  });

  it("returns false after a scheduled window ends", () => {
    expect(isOnVacation({
      vacation_starts_at: "2026-06-01T00:00:00Z",
      vacation_ends_at:   "2026-06-10T00:00:00Z",
    }, now)).toBe(false);
  });

  it("treats an open start bound as active until the end date", () => {
    expect(isOnVacation({ vacation_ends_at: "2026-06-20T00:00:00Z" }, now)).toBe(true);
    expect(isOnVacation({ vacation_ends_at: "2026-06-10T00:00:00Z" }, now)).toBe(false);
  });
});

describe("vacationReturnDate", () => {
  it("returns the end date when set", () => {
    expect(vacationReturnDate({ vacation_ends_at: "2026-06-20T00:00:00Z" }))
      .toEqual(new Date("2026-06-20T00:00:00Z"));
  });

  it("returns null when unset or invalid", () => {
    expect(vacationReturnDate({})).toBeNull();
    expect(vacationReturnDate(null)).toBeNull();
  });
});
