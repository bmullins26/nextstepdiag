export * from "./types";
export { decodeAge } from "./decode";
export { pickBestCandidate, computeAgeYears } from "./scoring";
export {
  resolveBrand,
  rulesForBrand,
  registerRule,
  registerBrandAlias,
  listSupportedBrands,
} from "./registry";
export type { BrandKey } from "./registry";