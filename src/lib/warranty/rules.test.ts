import { describe, it, expect } from "vitest";
import { computeWarranty } from "./rules";

describe("warranty rules", () => {
  it("Samsung fridge built 2021 in 2026: sealed system covered to 2026", () => {
    const r = computeWarranty({ brand: "Samsung", applianceType: "French Door Refrigerator", manufactureYear: 2021, currentYear: 2026 });
    expect(r.status).toBe("partial");
    expect(r.items.find((i) => i.component === "Sealed system")?.expiresYear).toBe(2026);
  });
  it("1-year base coverage active in build year + 1", () => {
    expect(computeWarranty({ brand: "GE", applianceType: "Dishwasher", manufactureYear: 2025, currentYear: 2026 }).status).toBe("in_warranty");
  });
  it("old Whirlpool washer is expired after 10-yr motor window", () => {
    expect(computeWarranty({ brand: "Whirlpool", applianceType: "Top-Load Washer", manufactureYear: 2010, currentYear: 2026 }).status).toBe("expired");
  });
  it("unknown build date returns unknown", () => {
    expect(computeWarranty({ brand: "LG", applianceType: "Washer", manufactureYear: null }).status).toBe("unknown");
  });
});
