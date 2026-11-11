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
import { allianceRules, goodmanRules, aoSmithRules, traneRules, carrierRules, lennoxRules, rheemRules, bradfordWhiteRules } from "./rules/hvac-water-laundry";

// Canonical brand keys (lowercase). Map any alias → canonical via BRAND_ALIASES.
export type BrandKey =
  | "whirlpool"
  | "ge"
  | "frigidaire"
  | "lg"
  | "samsung"
  | "bosch"
  | "fisherpaykel"
  | "miele"
  | "alliance"
  | "goodman"
  | "carrier"
  | "lennox"
  | "trane"
  | "rheem"
  | "bradfordwhite"
  | "aosmith";

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

  // Alliance Laundry
  "speed queen": "alliance", speedqueen: "alliance", huebsch: "alliance", unimac: "alliance", alliance: "alliance",
  // HVAC
  goodman: "goodman", daikin: "goodman", janitrol: "goodman", "amana hvac": "goodman",
  carrier: "carrier", bryant: "carrier", payne: "carrier", tempstar: "carrier", heil: "carrier",
  comfortmaker: "carrier", keeprite: "carrier", "day & night": "carrier", icp: "carrier",
  lennox: "lennox", armstrong: "lennox", ducane: "lennox", airease: "lennox", concord: "lennox",
  trane: "trane", "american standard": "trane", ameristar: "trane",
  rheem: "rheem", ruud: "rheem", weatherking: "rheem", richmond: "rheem",
  // Water heaters
  "bradford white": "bradfordwhite", bradfordwhite: "bradfordwhite",
  "a.o. smith": "aosmith", "ao smith": "aosmith", aosmith: "aosmith", state: "aosmith", reliance: "aosmith", american: "aosmith", lochinvar: "aosmith",
  // Other appliance brands built by existing parents
  philco: "frigidaire", dacor: "samsung", rca: "ge", americana: "ge", caloric: "whirlpool",
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
  alliance: [...allianceRules],
  goodman: [...goodmanRules],
  carrier: [...carrierRules],
  lennox: [...lennoxRules],
  trane: [...traneRules],
  rheem: [...rheemRules],
  bradfordwhite: [...bradfordWhiteRules],
  aosmith: [...aoSmithRules],
};

export function resolveBrand(brand: string): BrandKey | null {
  const k = brand.trim().toLowerCase();
  if (!k) return null;
  if (k in BRAND_ALIASES) return BRAND_ALIASES[k];
  return null;
}

/**
 * Some Kenmore appliances carry a 3-digit model prefix that identifies the
 * actual manufacturer (110/106 = Whirlpool, 363 = GE, 253 = Frigidaire, ...).
 * If brand resolution fails on "Kenmore" we re-route to the builder.
 */
const KENMORE_PREFIX_TO_BRAND: Record<string, BrandKey> = {
  "110": "whirlpool", // Whirlpool-built (most common: washers, dryers)
  "106": "whirlpool", // Whirlpool-built refrigerators
  "665": "whirlpool", // Whirlpool-built dishwashers
  "664": "whirlpool", // Whirlpool-built dishwashers
  "417": "frigidaire", // Frigidaire/Electrolux-built
  "970": "frigidaire", // Frigidaire-built
  "363": "ge",        // GE-built
  "362": "ge",        // GE-built
  "795": "lg",        // LG-built (newer refrigerators)
  "401": "samsung",   // Samsung-built (newer washers)
  "596": "whirlpool", // Whirlpool-built refrigerators
  "253": "frigidaire", // Frigidaire-built refrigerators
  "587": "frigidaire", // Frigidaire-built dishwashers
  "790": "frigidaire", // Frigidaire-built ranges
  "721": "lg",        // LG-built microwaves
  "796": "lg",        // LG-built laundry
  "592": "lg",        // LG-built
  "647": "alliance",  // Speed Queen-built laundry
};

function brandFromModel(model?: string): BrandKey | null {
  if (!model) return null;
  const m = model.replace(/[^0-9]/g, "");
  const prefix = m.slice(0, 3);
  return KENMORE_PREFIX_TO_BRAND[prefix] ?? null;
}

/**
 * Guess the manufacturer from an unmistakable model-number prefix. Used only
 * when the brand field is blank/unknown so techs aren't blocked.
 */
const MODEL_PREFIX_BRAND: Array<[RegExp, BrandKey]> = [
  [/^(FF|LF|FG|FP|FC|GC|CF|EI|EW|FR|FE)[A-Z]{1,3}\d/, "frigidaire"],
  [/^(WTW|WFW|WED|WGD|WRF|WRS|WRT|WDT|WFG|WFE|MHW|MTW|MED|MGD|MVW|MDB|MFI|KDF|KDT|KRF|KSR|NTW|NED)/, "whirlpool"],
  [/^(GSS|GSH|GFW|GFD|GTW|GTD|GDF|GDT|GNE|GYE|GFE|GTS|GBS|JGB|JB\d|PFE|PYE|PDT|CFE|PGB)/, "ge"],
  [/^(WA\d|WF\d|WV\d|DV[EG]?\d|NX\d|NE\d|RF\d|RS\d|DW80|ME\d)/, "samsung"],
  [/^(WM\d|WT\d|DLE|DLG|DLEX|DLGX|LRF|LFX|LDF|LSE|LRE|LRG|LMX)/, "lg"],
  [/^(DE\d|DG\d|WL\d|WH\d|DD\d|RF\d{3}|OR\d|GWL|IWL)/, "fisherpaykel"],
];

export function inferBrandFromModel(model?: string | null): BrandKey | null {
  const m = (model ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!m) return null;
  for (const [re, key] of MODEL_PREFIX_BRAND) if (re.test(m)) return key;
  return null;
}

export function rulesForBrand(brand: string, model?: string): Rule[] {
  let key = resolveBrand(brand) ?? inferBrandFromModel(model);
  // Kenmore is registered as a Whirlpool alias above, but other prefixes
  // (GE/Frigidaire/LG/Samsung-built) need model-prefix detection.
  if (brand.trim().toLowerCase().includes("kenmore")) {
    const fromModel = brandFromModel(model);
    if (fromModel) key = fromModel;
  }
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