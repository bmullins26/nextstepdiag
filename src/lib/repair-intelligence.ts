import { normalizeBrand, normalizeModel } from "@/lib/appliance/model-family";

export const REPAIR_OUTCOMES = [
  "confirmed_success",
  "reported_success",
  "diagnosed_pending_parts",
  "diagnosed_not_repaired",
  "unsuccessful_repair",
  "working_as_designed",
  "customer_declined",
  "referred_to_other_service",
  "unresolved",
  "needs_review",
] as const;

export type RepairOutcome = (typeof REPAIR_OUTCOMES)[number];

export const IMPORT_FIELDS = [
  "service_date",
  "brand",
  "appliance_type",
  "model_number",
  "customer_complaint",
  "diagnostic_findings",
  "error_codes",
  "parts_ordered",
  "parts_installed",
  "part_numbers",
  "repair_actions",
  "tests_performed",
  "operational_result",
  "outcome_classification",
  "original_repair_notes",
  "source_url",
  "review_required",
  "normalized_repair_outcome",
  "repair_reported_fixed",
  "operational_test_performed",
  "operational_test_result",
  "source_verified",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMapping = Partial<Record<ImportField, string>>;

const FIELD_LABELS: Record<ImportField, string> = {
  service_date: "Service date",
  brand: "Brand",
  appliance_type: "Appliance type",
  model_number: "Model number",
  customer_complaint: "Customer complaint",
  diagnostic_findings: "Diagnostic findings",
  error_codes: "Error codes",
  parts_ordered: "Parts ordered",
  parts_installed: "Parts installed",
  part_numbers: "Part numbers",
  repair_actions: "Repair actions",
  tests_performed: "Tests performed",
  operational_result: "Operational result",
  outcome_classification: "Original outcome",
  original_repair_notes: "Original repair notes",
  source_url: "Source URL",
  review_required: "Review required",
  normalized_repair_outcome: "Normalized outcome",
  repair_reported_fixed: "Reported fixed",
  operational_test_performed: "Operational test performed",
  operational_test_result: "Operational test result",
  source_verified: "Source verified",
};

export function importFieldLabel(field: ImportField) {
  return FIELD_LABELS[field];
}

const ALIASES: Record<ImportField, string[]> = {
  service_date: ["servicedate", "date", "calldate", "repairdate", "servicecall_date"],
  brand: ["brand", "manufacturer", "make", "appliancebrand"],
  appliance_type: ["appliancetype", "type", "producttype", "appliance", "product"],
  model_number: ["modelnumber", "model", "modelno", "appliancemodel"],
  customer_complaint: ["customercomplaint", "complaint", "symptom", "problem", "reportedproblem"],
  diagnostic_findings: ["diagnosticfindings", "findings", "diagnosis", "failedcomponent", "actualfailure"],
  error_codes: ["errorcodes", "errorcode", "faultcodes", "faultcode"],
  parts_ordered: ["partsordered", "orderedparts", "partordered"],
  parts_installed: ["partsinstalled", "installedparts", "partsreplaced", "partreplaced"],
  part_numbers: ["partnumbers", "partnumber", "partno", "oem_partnumbers"],
  repair_actions: ["repairactions", "repairaction", "repairs", "workperformed", "repairprocedure"],
  tests_performed: ["testsperformed", "testperformed", "confirmingtest", "confirmationtests"],
  operational_result: ["operationalresult", "testresult", "finalresult", "operationresult"],
  outcome_classification: ["outcomeclassification", "outcome", "originaloutcome", "status"],
  original_repair_notes: ["originalrepairnotes", "repairnotes", "notes", "techniciannotes", "servicenotes"],
  source_url: ["sourceurl", "url", "referenceurl", "source"],
  review_required: ["reviewrequired", "needsreview", "reviewflag"],
  normalized_repair_outcome: ["normalizedrepairoutcome", "normalizedoutcome"],
  repair_reported_fixed: ["repairreportedfixed", "reportedfixed", "repairsuccessful"],
  operational_test_performed: ["operationaltestperformed", "confirmationtestperformed"],
  operational_test_result: ["operationaltestresult", "confirmationtestresult", "passfail"],
  source_verified: ["sourceverified", "sourceverificationstatus", "verified"],
};

function headerKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const field of IMPORT_FIELDS) {
    const aliases = new Set([headerKey(field), ...ALIASES[field]]);
    const header = headers.find((h) => !used.has(h) && aliases.has(headerKey(h)));
    if (header) {
      mapping[field] = header;
      used.add(header);
    }
  }
  return mapping;
}

/** RFC4180-compatible parser, including quoted delimiters and multiline notes. */
export function parseCsv(text: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const input = text.replace(/^\uFEFF/, "");
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((v) => v.trim() !== "")) matrix.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) matrix.push(row);
  if (!matrix.length) return { headers: [], rows: [] };
  const headers = matrix[0].map((h) => h.trim());
  if (new Set(headers.map(headerKey)).size !== headers.length) throw new Error("CSV column names must be unique.");
  const rows = matrix.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? "").trim()])),
  );
  return { headers, rows };
}

function truthy(value: string) {
  return /^(yes|true|1|verified|passed|pass|fixed|confirmed)$/i.test(value.trim());
}

function splitList(value: string) {
  return value.split(/[;|\n]+/).map((v) => v.trim()).filter(Boolean).slice(0, 100);
}

function containsPotentialCustomerInfo(value: string) {
  return /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b|\b\d{1,6}\s+[\w.'-]+(?:\s+[\w.'-]+){0,2}\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd)\b|\bcustomer\s+(?:name|phone|number|address|email)\b/i.test(value);
}

function validDate(value: string) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/) ?? value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;
  const iso = match.length === 4 && match[1].length === 4
    ? `${match[1]}-${match[2]}-${match[3]}`
    : `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

export type NormalizedImportRecord = {
  rowNumber: number;
  serviceDate: string | null;
  brandRaw: string;
  brandDisplay: string;
  brandKey: string;
  applianceTypeRaw: string;
  applianceType: string;
  modelRaw: string;
  modelDisplay: string;
  modelKey: string;
  complaint: string;
  findings: string;
  errorCodes: string[];
  partsOrdered: string[];
  partsInstalled: string[];
  partNumbers: string[];
  repairActions: string[];
  testsPerformed: string[];
  operationalResult: string;
  originalOutcome: string;
  normalizedOutcome: RepairOutcome;
  reviewStatus: "pending" | "approved";
  sourceVerificationStatus: "unverified" | "verified" | "rejected";
  sourceUrl: string | null;
  originalNotes: string;
  originalRecord: Record<string, string>;
  unmappedFields: Record<string, string>;
  reviewFlags: string[];
};

export function normalizeImportRecord(
  raw: Record<string, string>,
  mapping: ColumnMapping,
  rowNumber: number,
): NormalizedImportRecord {
  const get = (field: ImportField) => (mapping[field] ? raw[mapping[field]]?.trim() ?? "" : "");
  const mappedHeaders = new Set(Object.values(mapping));
  const unmappedFields = Object.fromEntries(Object.entries(raw).filter(([key]) => !mappedHeaders.has(key)));
  const flags: string[] = [];
  const serviceDate = validDate(get("service_date"));
  if (get("service_date") && !serviceDate) flags.push("invalid_service_date");
  const brandRaw = get("brand");
  const modelRaw = get("model_number");
  if (!brandRaw) flags.push("missing_brand");
  if (!normalizeModel(modelRaw)) flags.push("missing_model_number");
  if (!get("customer_complaint") && !get("diagnostic_findings")) flags.push("missing_complaint_and_findings");

  const explicitOutcome = get("normalized_repair_outcome").toLowerCase() as RepairOutcome;
  let outcome: RepairOutcome = REPAIR_OUTCOMES.includes(explicitOutcome) ? explicitOutcome : "unresolved";
  if (!REPAIR_OUTCOMES.includes(explicitOutcome)) {
    const original = get("outcome_classification").toLowerCase();
    if (/pending.*part|part.*pending/.test(original)) outcome = "diagnosed_pending_parts";
    else if (/declin/.test(original)) outcome = "customer_declined";
    else if (/refer/.test(original)) outcome = "referred_to_other_service";
    else if (/working.*design|no.*fault/.test(original)) outcome = "working_as_designed";
    else if (/not.*repair/.test(original)) outcome = "diagnosed_not_repaired";
    else if (/unsuccess|fail|not.*fixed/.test(original)) outcome = "unsuccessful_repair";
    else if (/success|fixed|repair/.test(original)) outcome = "reported_success";
    else outcome = "needs_review";
  }

  const testPassed = truthy(get("operational_test_result")) || /^(pass|passed|fixed|operational|success)/i.test(get("operational_result"));
  const explicitlyVerified = truthy(get("repair_reported_fixed")) && truthy(get("operational_test_performed"));
  if (outcome === "confirmed_success" && !testPassed && !explicitlyVerified) {
    outcome = "reported_success";
    flags.push("confirmation_signal_missing");
  }
  if (truthy(get("review_required")) || outcome === "needs_review") {
    outcome = "needs_review";
    flags.push("owner_review_required");
  }
  if (flags.length) flags.push("record_level_review");

  const sourceValue = get("source_verified").toLowerCase();
  return {
    rowNumber,
    serviceDate,
    brandRaw,
    brandDisplay: brandRaw,
    brandKey: normalizeBrand(brandRaw),
    applianceTypeRaw: get("appliance_type"),
    applianceType: get("appliance_type"),
    modelRaw,
    modelDisplay: modelRaw,
    modelKey: normalizeModel(modelRaw),
    complaint: get("customer_complaint"),
    findings: get("diagnostic_findings"),
    errorCodes: splitList(get("error_codes")),
    partsOrdered: splitList(get("parts_ordered")),
    partsInstalled: splitList(get("parts_installed")),
    partNumbers: splitList(get("part_numbers")),
    repairActions: splitList(get("repair_actions")),
    testsPerformed: splitList(get("tests_performed")),
    operationalResult: get("operational_result"),
    originalOutcome: get("outcome_classification") || get("normalized_repair_outcome"),
    normalizedOutcome: outcome,
    reviewStatus: flags.length ? "pending" : "approved",
    sourceVerificationStatus: /^(yes|true|1|verified)$/.test(sourceValue) ? "verified" : /^(no|false|rejected)$/.test(sourceValue) ? "rejected" : "unverified",
    sourceUrl: get("source_url") || null,
    originalNotes: get("original_repair_notes"),
    originalRecord: raw,
    unmappedFields,
    reviewFlags: [...new Set(flags)],
  };
}

export function repairRecordKey(record: NormalizedImportRecord) {
  return [
    record.serviceDate ?? "",
    record.brandKey,
    record.modelKey,
    record.complaint.toLowerCase(),
    record.findings.toLowerCase(),
    record.errorCodes.join(",").toLowerCase(),
    record.partsInstalled.join(",").toLowerCase(),
    record.partNumbers.join(",").toLowerCase(),
    record.repairActions.join(",").toLowerCase(),
    record.originalOutcome.toLowerCase(),
  ].join("|");
}

export function latestLiveOutcomes<T extends { id: string; session_id: string | null; updated_at: string }>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const key = row.session_id ?? row.id;
    const previous = latest.get(key);
    if (!previous || row.updated_at > previous.updated_at) latest.set(key, row);
  }
  return [...latest.values()];
}

export function classifyLiveOutcome(input: {
  outcome: "confirmed" | "incorrect" | "partial" | "pending_repair";
  repairSuccessful?: boolean | null;
}): RepairOutcome {
  if (input.outcome === "pending_repair") return "diagnosed_pending_parts";
  if (input.repairSuccessful === false) return "unsuccessful_repair";
  if (input.outcome === "confirmed" && input.repairSuccessful === true) return "confirmed_success";
  if (input.outcome === "confirmed") return "reported_success";
  if (input.outcome === "partial" && input.repairSuccessful === true) return "reported_success";
  if (input.outcome === "incorrect") return "unsuccessful_repair";
  return "unresolved";
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
