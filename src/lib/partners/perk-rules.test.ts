import { describe, it, expect } from "vitest";
import { decidePerk } from "./perk-rules";

const now = new Date("2026-11-12T00:00:00Z");
describe("partner perk", () => {
  it("grants exactly 90 days of Pro to a free account", () => {
    const d = decidePerk({ tier: "free", plan_type: null, stripe_subscription_id: null, current_period_end: null }, false, 90, now);
    expect(d.action).toBe("grant");
    if (d.action === "grant") expect(d.expiresAt.toISOString()).toBe("2027-02-10T00:00:00.000Z");
  });
  it("can only be claimed once per account", () => {
    expect(decidePerk(null, true, 90, now).action).toBe("already_claimed");
  });
  it("does not overwrite an active paid Pro subscription", () => {
    expect(decidePerk({ tier: "pro", plan_type: "monthly", stripe_subscription_id: "sub_1", current_period_end: "2027-01-01T00:00:00Z" }, false, 90, now).action).toBe("already_pro");
  });
});
