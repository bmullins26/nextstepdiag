// Shared candidate validation. Every candidate must pass before scoring.
import type {
  DateCandidate,
  ModelWindow,
  RejectedCandidate,
  Rule,
  ValidationCheck,
} from "./types";

export type ValidationContext = {
  rule: Rule;
  now: Date;
  modelWindow?: ModelWindow | null;
};

export type ValidationResult =
  | { ok: true; checks: ValidationCheck[] }
  | { ok: false; checks: ValidationCheck[]; rejection: RejectedCandidate };

const EARLIEST_PLAUSIBLE_YEAR = 1960;

export function validateCandidate(
  c: DateCandidate,
  ctx: ValidationContext,
): ValidationResult {
  const checks: ValidationCheck[] = [];
  const nowYear = ctx.now.getFullYear();
  const nowMonth = ctx.now.getMonth() + 1;

  const fail = (
    reason: RejectedCandidate["reason"],
    detail: string,
  ): ValidationResult => {
    checks.push({ label: reason, passed: false, detail });
    return {
      ok: false,
      checks,
      rejection: {
        ruleId: ctx.rule.id,
        year: c.year,
        month: c.month ?? null,
        week: c.week ?? null,
        reason,
        detail,
      },
    };
  };

  // 1. Not in the future (allow the current month).
  if (c.year > nowYear || (c.year === nowYear && (c.month ?? 1) > nowMonth)) {
    return fail(
      "future_date",
      `${c.month ? `${c.month}/` : ""}${c.year} is later than today (${nowMonth}/${nowYear}).`,
    );
  }
  checks.push({ label: "Not in the future", passed: true });

  // 2. Plausible year at all.
  if (c.year < EARLIEST_PLAUSIBLE_YEAR) {
    return fail("implausible_year", `${c.year} predates modern appliance production.`);
  }
  checks.push({ label: "Year plausible", passed: true });

  // 3. Month valid.
  if (c.month != null && (c.month < 1 || c.month > 12)) {
    return fail("invalid_month", `Month ${c.month} is out of range.`);
  }
  checks.push({ label: "Month valid", passed: true });

  // 4. Week valid.
  if (c.week != null && (c.week < 1 || c.week > 53)) {
    return fail("invalid_week", `Week ${c.week} is out of range.`);
  }
  checks.push({ label: "Week valid", passed: true });

  // 5. Month and week must not contradict each other (week 1 ≠ December).
  if (c.month != null && c.week != null) {
    const monthFromWeek = Math.min(12, Math.max(1, Math.ceil(c.week / 4.345)));
    if (Math.abs(monthFromWeek - c.month) > 1) {
      return fail(
        "impossible_combination",
        `Week ${c.week} implies month ${monthFromWeek}, but month ${c.month} was decoded.`,
      );
    }
  }
  checks.push({ label: "Month/week agree", passed: true });

  // 6. Within the rule's effective date range.
  const from = ctx.rule.effectiveFrom;
  const to = ctx.rule.effectiveTo ?? null;
  if (from != null && c.year < from) {
    return fail(
      "outside_rule_effective_range",
      `${ctx.rule.name} was not in use before ${from}.`,
    );
  }
  if (to != null && c.year > to) {
    return fail(
      "outside_rule_effective_range",
      `${ctx.rule.name} was retired after ${to}.`,
    );
  }
  checks.push({ label: "Within format's era", passed: true });

  // 7. Within the model's production window.
  const w = ctx.modelWindow;
  if (w) {
    if (w.introducedYear != null && c.year < w.introducedYear) {
      return fail(
        "outside_model_window",
        `Model series was introduced in ${w.introducedYear}; ${c.year} is impossible.`,
      );
    }
    // Appliances ship for a while after a series is discontinued — allow +1yr.
    if (w.discontinuedYear != null && c.year > w.discontinuedYear + 1) {
      return fail(
        "outside_model_window",
        `Model series was discontinued in ${w.discontinuedYear}; ${c.year} is implausible.`,
      );
    }
    checks.push({
      label: "Within model production window",
      passed: true,
      detail: `${w.modelPrefix}: ${w.introducedYear ?? "?"}–${w.discontinuedYear ?? "current"}`,
    });
  }

  return { ok: true, checks };
}
