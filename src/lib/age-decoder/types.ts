// Deterministic appliance age decoder — type definitions.
// No AI. No I/O. Pure data structures and pure functions only.

export type Confidence = "High" | "Medium" | "Low" | "Unknown";

export type UnknownReason =
  | "unsupported_manufacturer"
  | "invalid_serial_format"
  | "missing_date_code"
  | "ambiguous_year_cycle"
  | "insufficient_information"
  | "low_confidence"
  | "year_not_in_table"
  | "kenmore_prefix_needed"
  | "no_candidate_fits";

/** Internal provenance of the chosen date. Never shown to technicians. */
export type DateSource = "plate_printed" | "plate_printed_prior" | "factory_record" | "serial" | "tech_picked";

export type YearMonth = { year: number; month?: number | null };

/** Evidence the server collects; decodeAge applies it in strict order. */
export type DecodeEvidence = {
  /** Date printed on the plate that the tech typed/confirmed now. */
  plateDate?: YearMonth | null;
  /** Earlier data-plate reports for this exact brand + serial. */
  priorPlate?: YearMonth[];
  /** Manufacturer build date (ServiceBench manufacturedDate only). */
  factory?: YearMonth | null;
  /** Shipped date: an upper bound only, never a build date. */
  shippedBy?: YearMonth | null;
  /** Receipt / invoice date: built on or before this. */
  receiptBy?: YearMonth | null;
};

export type DateCandidate = {
  year: number;
  month?: number; // 1-12
  week?: number;  // 1-53
  // Optional internal score (set by extract); higher = more likely.
  score?: number;
  /** Which reading of the serial produced this date (for explanations). */
  reading?: string;
  /** Evidence sources that corroborate this year (Firecrawl hits). */
  sources?: SourceHit[];
};

export type SourceTrust = "oem" | "trusted_reference" | "community";

/** Homespy-style data point category. Determines query template and weight. */
export type SourceType =
  | "manufacturer"
  | "retailer"
  | "review"
  | "general";

export type SourceHit = {
  url: string;
  title?: string;
  trust: SourceTrust;
  /** Which corroboration source category produced this hit. */
  sourceType?: SourceType;
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
  /** Which source types were actually queried (for UI/debug). */
  sourceTypes?: SourceType[];
  /** Retailer-signal narrowing: "discontinued" or "in_stock" when detected. */
  retailerSignal?: "discontinued" | "in_stock" | null;
};

export type AppliedRule = {
  id: string;
  name: string;
  family: string;
};

/** One line of the human-readable derivation shown in "Show Decode Logic". */
export type DecodeStep = {
  label: string;
  value: string;
  detail?: string;
};

export type RejectionReason =
  | "future_date"
  | "invalid_month"
  | "invalid_week"
  | "impossible_combination"
  | "outside_rule_effective_range"
  | "outside_model_window"
  | "implausible_year";

export type RejectedCandidate = {
  ruleId: string;
  year: number;
  month?: number | null;
  week?: number | null;
  reason: RejectionReason;
  detail: string;
};

export type ValidationCheck = {
  label: string;
  passed: boolean;
  detail?: string;
};

export type ConfidencePoint = {
  label: string;
  points: number;
  awarded: boolean;
  detail?: string;
};

export type ConfidenceBreakdown = {
  points: ConfidencePoint[];
  earned: number;
  max: number;
  percent: number;
  label: Confidence;
};

/** Production window for a model prefix — used to reject impossible years. */
export type ModelWindow = {
  manufacturer?: string | null;
  brand?: string | null;
  modelPrefix: string;
  introducedYear: number | null;
  discontinuedYear: number | null;
  replacementSeries?: string | null;
  /** owner = curated range; tech_confirmed = learned from plate dates; oem_timeline = bundled official data. */
  kind?: "owner" | "tech_confirmed" | "oem_timeline";
  evidenceCount?: number;
  observedMinYear?: number | null;
  observedMaxYear?: number | null;
};

/** Cross-validation inputs supplied by the server fn (never fetched here). */
export type CrossChecks = {
  /** Year returned by the Appliance Age Finder API, when available. */
  apiYear?: number | null;
  /** Technician-confirmed year for this exact serial, when available. */
  confirmedYear?: number | null;
  /** How many technicians confirmed that year for this model/serial pattern. */
  communityConfirmations?: number;
  /** Years previously decoded successfully for the same model family. */
  historicalYears?: number[];
};

export type Rule = {
  id: string;
  name: string;
  family: string;
  pattern: RegExp;
  weight: number; // 0..1 base confidence
  /** Stable format identifier, e.g. "whirlpool.format-b". Defaults to `id`. */
  formatId?: string;
  /** First year this serial format was in use. */
  effectiveFrom?: number;
  /** Last year this format was in use (null/undefined = still current). */
  effectiveTo?: number | null;
  /** Higher priority rules are evaluated first. Default 50. */
  priority?: number;
  /** 0-based positions that must be digits; O→0 and I→1 are corrected only there. */
  digitPositions?: number[];
  /** Only applies when the raw brand (lowercased) is one of these. */
  brandFilter?: string[];
  /** Shown when the format matches but no date could be read from the table. */
  noDateMessage?: string;
  extract: (serial: string, model?: string) => DateCandidate[];
  explain: (serial: string, candidate: DateCandidate) => string;
  /** Structured character-by-character derivation for the "Why?" panel. */
  steps?: (serial: string, candidate: DateCandidate) => DecodeStep[];
};

export type DecodeInput = {
  brand: string;
  model?: string;
  serial: string;
  /** Optional clock injection for tests. */
  now?: Date;
  /** Optional pre-fetched corroboration (server-fn injects this). */
  corroboration?: Corroboration | null;
  /** Optional production window for the model (server-fn injects this). */
  modelWindow?: ModelWindow | null;
  /** Optional cross-validation signals (server-fn injects these). */
  crossChecks?: CrossChecks | null;
  /** Evidence applied in strict order (plate → factory → bounds → window). */
  evidence?: DecodeEvidence | null;
};

export type DecodeOk = {
  status: "ok";
  appliedRule: AppliedRule;
  manufactureYear: number;
  manufactureMonth: number | null;
  manufactureWeek: number | null;
  ageYears: number;
  confidence: Confidence;
  confidencePercent: number;   // 0..100 (weighted evidence model)
  candidates: DateCandidate[];
  breakdown: string;
  corroboration: Corroboration | null;
  steps: DecodeStep[];
  rejected: RejectedCandidate[];
  validation: ValidationCheck[];
  confidenceBreakdown: ConfidenceBreakdown;
  attemptedRules: { id: string; name: string; matched: boolean; reason?: string }[];
  /** Internal provenance of the chosen date. */
  dateSource: DateSource;
  normalizedSerial: string;
};

/** More than one date remains: never pick one. */
export type DecodeAmbiguous = {
  status: "ambiguous";
  appliedRule: AppliedRule | null;
  confidence: "Unknown";
  confidencePercent: number;
  breakdown: string;
  candidates: DateCandidate[];
  corroboration: Corroboration | null;
  steps: DecodeStep[];
  rejected: RejectedCandidate[];
  validation: ValidationCheck[];
  confidenceBreakdown: ConfidenceBreakdown | null;
  attemptedRules: { id: string; name: string; matched: boolean; reason?: string }[];
  normalizedSerial: string;
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
  steps: DecodeStep[];
  rejected: RejectedCandidate[];
  validation: ValidationCheck[];
  confidenceBreakdown: ConfidenceBreakdown | null;
  attemptedRules: { id: string; name: string; matched: boolean; reason?: string }[];
  normalizedSerial?: string;
};

export type DecodeOutcome = DecodeOk | DecodeAmbiguous | DecodeUnknown;