import { expect, test } from "bun:test";
import { completedYears, manufactureRange } from "../age-math";
test("2019 week 51 build is 6 full years old in Nov 2026", () => {
  const r = manufactureRange(2019, null, 51);
  expect(r.start).toBe("2019-12-17");
  expect(completedYears(r.start, new Date("2026-11-11T00:00:00Z"))).toBe(6);
});
test("early-2019 build is 7 years in Nov 2026, never 8", () => {
  expect(completedYears("2019-01-01", new Date("2026-11-11T00:00:00Z"))).toBe(7);
});
