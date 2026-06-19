export * from "./types";
export { decodeAge } from "./decode";
export {
  pickBestCandidate,
  computeAgeYears,
  scoreConfidence,
  applyCorroboration,
  MAX_CONFIDENCE_PERCENT,
} from "./scoring";
export {
  resolveBrand,
  rulesForBrand,
  registerRule,
  registerBrandAlias,
  listSupportedBrands,
} from "./registry";
export type { BrandKey } from "./registry";