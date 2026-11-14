import { describe, expect, it } from "vitest";
import {
  detectColumnMapping,
  normalizeImportRecord,
  parseCsv,
  repairRecordKey,
  classifyLiveOutcome,
  latestLiveOutcomes,
} from "./repair-intelligence";

const headers = ["service_date", "brand", "model_number", "customer_complaint", "diagnostic_findings", "normalized_repair_outcome", "repair_reported_fixed", "operational_test_performed", "operational_test_result", "technician"];
const mapping = detectColumnMapping(headers);
function row(values: Partial<Record<string, string>>) {
  return Object.fromEntries(headers.map((h) => [h, values[h] ?? ""]));
}

describe("repair history CSV normalization", () => {
  it("maps the audited CSV fields and preserves unmapped technician data for owner review", () => {
    const raw = row({ brand: "Maytag", model_number: "MTW6205RW1", customer_complaint: "Will not drain", technician: "Private Name" });
    const record = normalizeImportRecord(raw, mapping, 2);
    expect(record.modelKey).toBe("MTW6205RW1");
    expect(record.unmappedFields.technician).toBe("Private Name");
    expect(record.originalRecord).toEqual(raw);
  });

  it("parses quoted commas, escaped quotes, and multiline notes", () => {
    const parsed = parseCsv('brand,model_number,original_repair_notes\nMaytag,"M123,X","said ""no drain""\nsecond line"');
    expect(parsed.rows[0].model_number).toBe("M123,X");
    expect(parsed.rows[0].original_repair_notes).toContain("second line");
  });

  it("requires an operational confirmation signal for confirmed success", () => {
    const base = { brand: "GE", model_number: "G1", normalized_repair_outcome: "confirmed_success", repair_reported_fixed: "yes" };
    const unverified = normalizeImportRecord(row(base), mapping, 2);
    expect(unverified.normalizedOutcome).toBe("reported_success");
    expect(unverified.reviewStatus).toBe("pending");
    const confirmed = normalizeImportRecord(row({ ...base, operational_test_performed: "yes", operational_test_result: "passed" }), mapping, 2);
    expect(confirmed.normalizedOutcome).toBe("confirmed_success");
  });

  it("never turns pending parts into success", () => {
    const record = normalizeImportRecord(row({ normalized_repair_outcome: "diagnosed_pending_parts", repair_reported_fixed: "yes", operational_test_result: "passed" }), mapping, 2);
    expect(record.normalizedOutcome).toBe("diagnosed_pending_parts");
  });

  it("deduplicates the same service call independently of CSV column order", async () => {
    const raw = row({ service_date: "2026-11-01", brand: "Whirlpool", model_number: "WTW-123", customer_complaint: "No spin", normalized_repair_outcome: "reported_success" });
    const a = normalizeImportRecord(raw, mapping, 2);
    const reversed = Object.fromEntries(Object.entries(raw).reverse());
    const b = normalizeImportRecord(reversed, mapping, 3);
    expect(repairRecordKey(a)).toBe(repairRecordKey(b));
  });

  it("requires review for missing model numbers instead of aggregating them", () => {
    const record = normalizeImportRecord(row({ brand: "LG", model_number: "" }), mapping, 2);
    expect(record.reviewStatus).toBe("pending");
    expect(record.reviewFlags).toContain("missing_model_number");
  });

  it("holds records with possible customer contact details out of shared aggregates", () => {
    const record = normalizeImportRecord(row({ brand: "GE", model_number: "G1", customer_complaint: "Call 216-555-0194 about no cooling" }), mapping, 2);
    expect(record.reviewStatus).toBe("pending");
    expect(record.reviewFlags).toContain("possible_customer_information");
  });

  it("counts only the latest outcome for a reopened diagnostic session", () => {
    const rows = [
      { id: "first", session_id: "session-1", normalized_outcome: "diagnosed_pending_parts", updated_at: "2026-01-01" },
      { id: "second", session_id: "session-1", normalized_outcome: "confirmed_success", updated_at: "2026-01-02" },
      { id: "other", session_id: null, normalized_outcome: "unsuccessful_repair", updated_at: "2026-01-01" },
    ];
    const latest = latestLiveOutcomes(rows);
    expect(latest).toHaveLength(2);
    expect(latest.find((r) => r.session_id === "session-1")?.normalized_outcome).toBe("confirmed_success");
  });

  it("keeps live confirmed, reported, pending, and unsuccessful outcomes separate", () => {
    expect(classifyLiveOutcome({ outcome: "confirmed", repairSuccessful: true })).toBe("confirmed_success");
    expect(classifyLiveOutcome({ outcome: "confirmed", repairSuccessful: null })).toBe("reported_success");
    expect(classifyLiveOutcome({ outcome: "pending_repair", repairSuccessful: true })).toBe("diagnosed_pending_parts");
    expect(classifyLiveOutcome({ outcome: "incorrect", repairSuccessful: false })).toBe("unsuccessful_repair");
  });
});
