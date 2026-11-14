import { test, expect, describe } from "bun:test";
import { decodeAge } from "../decode";
import { fixtures, NOW } from "./fixtures";

describe("age decoder fixtures (AF-1)", () => {
  for (const f of fixtures) {
    test(f.label, () => {
      const out = decodeAge({ brand: f.brand, model: f.model, serial: f.serial, now: NOW });
      expect(out.status).toBe(f.expect.status);
      const e = f.expect;
      if (e.status === "ok" && out.status === "ok") {
        expect(out.manufactureYear).toBe(e.year);
        if (e.month != null) expect(out.manufactureMonth).toBe(e.month);
        if (e.week != null) expect(out.manufactureWeek).toBe(e.week);
      }
      if (e.status === "ambiguous" && out.status === "ambiguous") {
        const years = [...new Set(out.candidates.map((c) => c.year))];
        if (e.first != null) expect(out.candidates[0]!.year).toBe(e.first);
        if (e.years) expect(years.slice().sort()).toEqual(e.years.slice().sort());
        for (const x of e.excludes ?? []) expect(years).not.toContain(x);
        if (e.week != null) expect(out.candidates.every((c) => c.week === e.week)).toBe(true);
        for (const inc of e.includes ?? []) {
          expect(out.candidates.some((c) => c.year === inc.year && (inc.month == null || c.month === inc.month) && (inc.week == null || c.week === inc.week))).toBe(true);
        }
        // Ambiguous never carries a chosen year or age.
        expect((out as Record<string, unknown>).manufactureYear).toBeUndefined();
        expect((out as Record<string, unknown>).ageYears).toBeUndefined();
      }
      if (e.status === "unknown" && out.status === "unknown" && e.unknownReason) {
        expect(out.unknownReason).toBe(e.unknownReason);
      }
    });
  }

  test("decodeAge is pure (same input → same output)", () => {
    const a = decodeAge({ brand: "Whirlpool", serial: "CR2512345", now: NOW });
    const b = decodeAge({ brand: "Whirlpool", serial: "CR2512345", now: NOW });
    expect(a).toEqual(b);
  });

  test("a reading with an invalid week drops out (MX06404786 source-letter reading has week 64)", () => {
    const out = decodeAge({ brand: "Whirlpool", serial: "MX06404786", now: NOW });
    expect(out.candidates.every((c) => c.week === 6)).toBe(true);
  });
});
