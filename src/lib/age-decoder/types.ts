// Deterministic appliance age decoder — type definitions.
// No AI. No I/O. Pure data structures and pure functions only.

export type Confidence = "High" | "Medium" | "Low" | "Unknown";

export type UnknownReason =
  | "unsupported_manufacturer"
  | "invalid_serial_format"
  | "missing_date_code"
  | "ambiguous_year_cycle"
  | "insufficient_information"
  | "low_confidence";

export type DateCandidate = {
  year: number;
  month?: number; // 1-12
  week?: number;  // 1-53
  // Optional internal score (set by extract); higher = more likely.
  score?: number;
  /** Evidence sources that corroborate this year (Firecrawl hits). */
  sources?: SourceHit[];
};

export type SourceTrust = "oem" | "trusted_reference" | "community";

export type SourceHit = {
  url: string;
  title?: string;
  trust: SourceTrust;
  /** Year mentioned near the model number in the source. */
  year?: number;
  /** Brief markdown excerpt around the match. */
  excerpt?: string;
};

export type Corroboration = {
  used: boolean;
  cached: boolean;
  query?: string;
  hits: SourceHit[];
  /** Adjusted score per year from corroboration evidence. */
  yearBoosts: Record<number, number>;
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
  /** Optional pre-fetched corroboration (server-fn injects this). */
  corroboration?: Corroboration | null;
};

export type DecodeOk = {
  status: "ok";
  appliedRule: AppliedRule;
  manufactureYear: number;
  manufactureMonth: number | null;
  manufactureWeek: number | null;
  ageYears: number;
  confidence: Confidence;
  confidencePercent: number;   // 0..80 (homespy cap)
  candidates: DateCandidate[];
  breakdown: string;
  corroboration: Corroboration | null;
};

export type DecodeUnknown = {
  status: "unknown";
  appliedRule: AppliedRule | null;
  confidence: "Unknown";
  confidencePercent: number;   // always 0 on unknown
  unknownReason: UnknownReason;
  breakdown: string;
  candidates: DateCandidate[];
  corroboration: Corroboration | null;
};

export type DecodeOutcome = DecodeOk | DecodeUnknown;