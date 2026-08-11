import { test, expect, describe } from "bun:test";
import { decodeAge } from "../decode";
import { validateCandidate } from "../validate";
import { compileRule } from "../rule-format";
import type { ModelWindow, Rule } from "../types";

const NOW = new Date("2026-06-01T00:00:00Z");

const testRule: Rule = compileRule({
  manufacturer: "TestCo",
  formatId: "testco.format-a",
  name: "TestCo Format A",
  serialFormats: ["^[A-M][0-9]{4}$"],
  yearPosition: { kind: "letter-cycle", start: 0 },
  lookupTables: { yearLetters: "ABCDEFGHJKLM", cycleStart: 1990, cycleLength: 12 },
  effectiveFrom: 1990,
  effectiveTo: null,
  confidenceWeight: 0.9,
});

describe("validation layer", () => {
  const base = { rule: testRule, now: NOW };

  test("rejects future dates", () => {
    const r = validateCandidate({ year: 2030, score: 1 }, base);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection.reason).toBe("future_date");
  });

  test("rejects a month later than today in the current year", () => {
    const r = validateCandidate({ year: 2026, month: 12, score: 1 }, base);
    expect(r.ok).toBe(false);
  });

  test("rejects invalid months and weeks", () => {
    expect(validateCandidate({ year: 2020, month: 13, score: 1 }, base).ok).toBe(false);
    expect(validateCandidate({ year: 2020, week: 60, score: 1 }, base).ok).toBe(false);
  });

  test("rejects impossible month/week combinations", () => {
    const r = validateCandidate({ year: 2020, month: 12, week: 2, score: 1 }, base);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection.reason).toBe("impossible_combination");
  });

  test("rejects years outside the format's effective era", () => {
    const r = validateCandidate({ year: 1985, score: 1 }, base);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection.reason).toBe("outside_rule_effective_range");
  });

  test("rejects years outside the model production window", () => {
    const modelWindow: ModelWindow = {
      modelPrefix: "XYZ",
      introducedYear: 2021,
      discontinuedYear: null,
    };
    const r = validateCandidate({ year: 2003, score: 1 }, { ...base, modelWindow });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejection.reason).toBe("outside_model_window");
  });

  test("accepts a plausible date", () => {
    expect(validateCandidate({ year: 2019, month: 10, week: 42, score: 1 }, base).ok).toBe(true);
  });
});

describe("declarative rule compiler", () => {
  test("decodes a letter-cycle year and produces decode steps", () => {
    const cands = testRule.extract("C1234");
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.map((c) => c.year)).toContain(2016); // 1990 + 2 + 12*2
    const steps = testRule.steps!("C1234", cands[0]!);
    expect(steps.some((s) => s.value.includes("Year code"))).toBe(true);
  });
});

describe("decode engine explainability + cross-validation", () => {
  test("returns steps, validation and a confidence breakdown", () => {
    const out = decodeAge({
      brand: "Whirlpool",
      model: "WDT750SAKZ0",
      serial: "CC1212345",
      now: NOW,
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.steps.length).toBeGreaterThan(0);
    expect(out.validation.every((v) => v.passed)).toBe(true);
    expect(out.confidenceBreakdown.percent).toBe(out.confidencePercent);
    expect(out.attemptedRules.length).toBeGreaterThan(0);
  });

  test("model production window rejects impossible candidates", () => {
    const out = decodeAge({
      brand: "Whirlpool",
      model: "WDT750SAKZ0",
      serial: "CF2328200",
      now: NOW,
      modelWindow: { modelPrefix: "WDT750", introducedYear: 2015, discontinuedYear: null },
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.manufactureYear).toBeGreaterThanOrEqual(2015);
    expect(out.rejected.some((r) => r.reason === "outside_model_window")).toBe(true);
  });

  test("agreement with an external source raises confidence", () => {
    const args = { brand: "LG", model: "WM0642HW/02", serial: "909KWAT04496", now: NOW };
    const plain = decodeAge(args);
    const crossed = decodeAge({ ...args, crossChecks: { apiYear: 2009 } });
    expect(crossed.status).toBe("ok");
    if (crossed.status !== "ok" || plain.status !== "ok") return;
    expect(crossed.manufactureYear).toBe(2009);
    expect(crossed.confidencePercent).toBeGreaterThan(plain.confidencePercent);
  });

  test("technician confirmations are reflected as community verification", () => {
    const out = decodeAge({
      brand: "Whirlpool",
      model: "WDT750SAKZ0",
      serial: "CF2328200",
      now: NOW,
      crossChecks: { confirmedYear: 1998, communityConfirmations: 3 },
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.manufactureYear).toBe(1998);
    expect(out.confidenceBreakdown.points.some((p) => p.label === "Community verified")).toBe(true);
  });

  test("never returns a future manufacture year", () => {
    const out = decodeAge({ brand: "Frigidaire", serial: "29151234567", now: NOW });
    if (out.status === "ok") expect(out.manufactureYear).toBeLessThanOrEqual(2026);
  });
});
