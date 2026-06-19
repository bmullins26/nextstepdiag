// Deterministic appliance age decoder — type definitions.
// No AI. No I/O. Pure data structures and pure functions only.

export type Confidence = "High" | "Medium" | "Low" | "Unknown";

export type UnknownReason =
  | "unsupported_manufacturer"
  | "invalid_serial_format"
  | "missing_date_code"
  | "ambiguous_year_cycle"
  | "insufficient_information";

export type DateCandidate = {
  year: number;
  month?: number; // 1-12
  week?: number;  // 1-53
  // Optional internal score (set by extract); higher = more likely.
  score?: number;
};

export type AppliedRule = {
  id: string;
  name: string;
  family: string;
};

export type Rule = {
  id: string;
  name: string;
  family: string;
  pattern: RegExp;
  weight: number; // 0..1 base confidence
  extract: (serial: string, model?: string) => DateCandidate[];
  explain: (serial: string, candidate: DateCandidate) => string;
};

export type DecodeInput = {
  brand: string;
  model?: string;
  serial: string;
  /** Optional clock injection for tests. */
  now?: Date;
};

export type DecodeOk = {
  status: "ok";
  appliedRule: AppliedRule;
  manufactureYear: number;
  manufactureMonth: number | null;
  manufactureWeek: number | null;
  ageYears: number;
  confidence: Confidence;
  candidates: DateCandidate[];
  breakdown: string;
};

export type DecodeUnknown = {
  status: "unknown";
  appliedRule: AppliedRule | null;
  confidence: "Unknown";
  unknownReason: UnknownReason;
  breakdown: string;
  candidates: DateCandidate[];
};

export type DecodeOutcome = DecodeOk | DecodeUnknown;