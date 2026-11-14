import { test, expect } from "bun:test";
import { formatAge, formatStoredAge } from "../age-math";
import { safeIdentify } from "../../appliance-identify";
import { NOW } from "./fixtures";

test("age floors; month/week known → X yr", () => {
  expect(formatAge({ year: 2016, month: 12 }, NOW)).toBe("9 yr");
  expect(formatAge({ year: 2016, month: 3 }, NOW)).toBe("10 yr");
  expect(formatAge({ year: 2026, week: 1 }, NOW)).toBe("0 yr");
});
test("year only → X–Y yr", () => {
  expect(formatAge({ year: 2016 }, NOW)).toBe("9–10 yr");
});
test("ambiguous → no age", () => {
  expect(formatAge({ year: 2016, month: 3 }, NOW, true)).toBeNull();
});
test("history detail age is floored, never rounded", () => {
  expect(formatStoredAge(9.8)).toBe("9 yr");
  expect(formatStoredAge(null)).toBeNull();
});
test("AI identification failure still returns, with blank type", async () => {
  const r = await safeIdentify(async () => { throw new Error("gateway down"); }, "LG");
  expect(r.failed).toBe(true);
  expect(r.id.applianceType).toBe("");
  expect(r.id.manufacturer).toBe("LG");
});
