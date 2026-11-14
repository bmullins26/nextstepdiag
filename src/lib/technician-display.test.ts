import { describe, expect, test } from "bun:test";
import type { EvidenceSourceType } from "@/lib/evidence/types";
import { SOURCE_KIND_LABEL, formatRepairHistoryRow, warrantyRecordLabel } from "./technician-display";

describe("technician-facing display wording", () => {
  test("repair history uses counts only at every sample size", () => {
    expect(formatRepairHistoryRow(1, 1, "Gearcase")).toBe("1 of 1 repair: Gearcase");
    expect(formatRepairHistoryRow(3, 6, "Gearcase")).toBe("3 of 6 repairs: Gearcase");
    expect(formatRepairHistoryRow(6, 6, "Gearcase")).not.toContain("%");
  });

  test("warranty source labels never claim verification", () => {
    expect(warrantyRecordLabel(true)).toBe("Whirlpool serial record");
    expect(warrantyRecordLabel(false)).toBe("Model coverage estimate");
    expect(warrantyRecordLabel(true)).not.toMatch(/verified/i);
    expect(warrantyRecordLabel(false)).not.toMatch(/verified/i);
  });

  test("source-kind labels contain no ranking or review wording", () => {
    for (const [sourceType, label] of Object.entries(SOURCE_KIND_LABEL) as Array<[EvidenceSourceType, string]>) {
      expect(label, sourceType).not.toMatch(/verified|unverified|unreviewed|tier|T[1-5]/i);
    }
    expect(SOURCE_KIND_LABEL.verified_repair).toBe("Repair record");
    expect(SOURCE_KIND_LABEL.fallback_unreviewed).toBe("Reference material");
  });
});
