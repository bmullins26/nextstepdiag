// Brand → rules registry. New manufacturers register here without touching
// decode.ts / scoring.ts.
import type { Rule } from "./types";
import { whirlpoolRules } from "./rules/whirlpool";
import { geRules } from "./rules/ge";
import { frigidaireRules } from "./rules/frigidaire";
import { lgRules } from "./rules/lg";
import { samsungRules } from "./rules/samsung";
import { boschRules } from "./rules/bosch";
import { fisherPaykelRules } from "./rules/fisherpaykel";
import { mieleRules } from "./rules/miele";

// Canonical brand keys (lowercase). Map any alias → canonical via BRAND_ALIASES.
export type BrandKey =
  | "whirlpool"
  | "ge"
  | "frigidaire"
  | "lg"
  | "samsung"
  | "bosch"
  | "fisherpaykel"
  | "miele";

// Brand families: any of these alias strings (lowercase) maps to the canonical key.
const BRAND_ALIASES: Record<string, BrandKey> = {
  // Whirlpool family
  whirlpool: "whirlpool",
  kitchenaid: "whirlpool",
  maytag: "whirlpool",
  amana: "whirlpool",
  "jenn-air": "whirlpool",
  jennair: "whirlpool",
  roper: "whirlpool",
  estate: "whirlpool",
  inglis: "whirlpool",
  "magic chef": "whirlpool",
  magicchef: "whirlpool",
  admiral: "whirlpool",
  crosley: "whirlpool",
  kenmore: "whirlpool",
  "kenmore / sears": "whirlpool",

  // GE family
  ge: "ge",
  "ge (general electric)": "ge",
  "general electric": "ge",
  hotpoint: "ge",
  cafe: "ge",
  haier: "ge",
  profile: "ge",
  monogram: "ge",

  // Frigidaire / Electrolux family
  frigidaire: "frigidaire",
  electrolux: "frigidaire",
  gibson: "frigidaire",
  tappan: "frigidaire",
  kelvinator: "frigidaire",
  westinghouse: "frigidaire",
  "white-westinghouse": "frigidaire",

  // LG
  lg: "lg",

  // Samsung
  samsung: "samsung",

  // BSH (Bosch, Thermador, Gaggenau, Siemens)
  bosch: "bosch",
  thermador: "bosch",
  gaggenau: "bosch",
  siemens: "bosch",

  // Fisher & Paykel
  "fisher & paykel": "fisherpaykel",
  "fisher and paykel": "fisherpaykel",
  fisherpaykel: "fisherpaykel",
  "fisher paykel": "fisherpaykel",

  // Miele
  miele: "miele",
};

const REGISTRY: Record<BrandKey, Rule[]> = {
  whirlpool: [...whirlpoolRules],
  ge: [...geRules],
  frigidaire: [...frigidaireRules],
  lg: [...lgRules],
  samsung: [...samsungRules],
  bosch: [...boschRules],
  fisherpaykel: [...fisherPaykelRules],
  miele: [...mieleRules],
};

export function resolveBrand(brand: string): BrandKey | null {
  const k = brand.trim().toLowerCase();
  if (!k) return null;
  if (k in BRAND_ALIASES) return BRAND_ALIASES[k];
  return null;
}

export function rulesForBrand(brand: string): Rule[] {
  const key = resolveBrand(brand);
  if (!key) return [];
  return REGISTRY[key] ?? [];
}

/** Add a rule for a brand at runtime (used by tests or future manufacturers). */
export function registerRule(brand: BrandKey, rule: Rule): void {
  (REGISTRY[brand] ??= []).push(rule);
}

/** Register a new manufacturer alias → existing canonical key. */
export function registerBrandAlias(alias: string, key: BrandKey): void {
  BRAND_ALIASES[alias.trim().toLowerCase()] = key;
}

export function listSupportedBrands(): BrandKey[] {
  return Object.keys(REGISTRY) as BrandKey[];
}