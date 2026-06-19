export type SourceTrust = "oem" | "trusted_reference" | "community";

export type Confidence =
  | "exact_model"
  | "platform_family"
  | "manufacturer_family"
  | "low";

export type FaultCode = {
  code: string;
  meaning: string;
  test?: string;
};

export type TestPoint = {
  label: string;
  connector?: string;
  pins?: string;
  expected?: string;
  condition?: string;
};

export type TechSheet = {
  id?: string;
  brand: string;
  modelNumber: string;
  platformFamily: string | null;
  sourceUrl: string | null;
  sourceType: string;
  sourceTrust: SourceTrust;
  contentMarkdown: string;
  faultCodes: FaultCode[];
  testPoints: TestPoint[];
  confidence: Confidence;
  fetchedAt: string;
};

export type GroundingResult = {
  sheet: TechSheet | null;
  confidence: Confidence;
  sourceTrust: SourceTrust | null;
  sourceUrl: string | null;
  sourceType: string;
  platformFamily: string | null;
  displayLabel: string;
  trustLabel: string;
  cacheHit: boolean;
};

/**
 * Numeric trust ranking. Higher = more authoritative.
 * Reserve `fred_historical` (80) for future Fred's data integration
 * without changing diagnostics architecture.
 */
export const TRUST_RANK: Record<string, number> = {
  oem: 100,
  fred_historical: 80,
  trusted_reference: 60,
  community: 20,
};

export const CONFIDENCE_RANK: Record<Confidence, number> = {
  exact_model: 100,
  platform_family: 70,
  manufacturer_family: 40,
  low: 0,
};

export const TRUST_LABELS: Record<SourceTrust, string> = {
  oem: "OEM Source",
  trusted_reference: "Trusted Technical Reference",
  community: "Community Source",
};