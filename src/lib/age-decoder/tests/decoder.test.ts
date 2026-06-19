import { test, expect, describe } from "bun:test";
import { decodeAge } from "../decode";
import { fixtures } from "./fixtures";

describe("age decoder (deterministic, no AI)", () => {
  for (const f of fixtures) {
    test(f.label, () => {
      const out = decodeAge({ brand: f.brand, model: f.model, serial: f.serial, now: f.now });
      expect(out.status).toBe(f.expect.status);
      if (f.expect.status === "ok" && out.status === "ok") {
        if (f.expect.year != null) expect(out.manufactureYear).toBe(f.expect.year);
        if (f.expect.month != null) expect(out.manufactureMonth).toBe(f.expect.month);
        if (f.expect.week != null) expect(out.manufactureWeek).toBe(f.expect.week);
        if (f.expect.confidence) expect(out.confidence).toBe(f.expect.confidence);
        if (f.expect.ruleId) expect(out.appliedRule.id).toBe(f.expect.ruleId);
        expect(out.ageYears).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(out.ageYears)).toBe(true);
      }
      if (f.expect.status === "unknown" && out.status === "unknown") {
        if (f.expect.unknownReason) expect(out.unknownReason).toBe(f.expect.unknownReason);
      }
    });
  }

  test("decodeAge is pure (same input → same output)", () => {
    const a = decodeAge({ brand: "Frigidaire", serial: "24151234567", now: new Date("2026-06-01") });
    const b = decodeAge({ brand: "Frigidaire", serial: "24151234567", now: new Date("2026-06-01") });
    expect(a).toEqual(b);
  });
});