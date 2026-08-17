/**
 * Verified Appliance Data (verifiedappliancedata.com) — HTML → repair-relevant
 * structured record.
 *
 * Deterministic parser. It runs BEFORE the Knowledge Engine's AI normalization
 * so the exclusion rules are enforced by code, not by a prompt:
 *
 *  - ENERGY STAR / DOE energy-efficiency data (kWh, annual cost, IMEF, IWF,
 *    CEF, water use, efficiency rankings) is never carried into a document.
 *  - Consumer shopping data (prices, retailer listings, affiliate/buy links,
 *    "worth fixing" cost maths, replacement-model tables) is never carried
 *    into a document. Bare part numbers survive — they are service data.
 *  - Every record keeps its SCOPE (model / category / manufacturer) so a
 *    category-general failure statement can never be presented as a verified
 *    model-specific failure.
 */

export const VAD_BASE_URL = "https://verifiedappliancedata.com";
export const VAD_SOURCE_NAME = "Verified Appliance Data";
export const VAD_LICENSE = "CC-BY-4.0";

export type VadScope = "model" | "category" | "manufacturer";

/** Catalogue fields that are energy/efficiency or shopping data — never imported. */
export const VAD_EXCLUDED_CATALOG_FIELDS = [
  "energy_star",
  "energy_star_most_efficient",
  "kwh_per_year",
  "kwh_basis",
  "computed",
  "imef",
  "iwf",
  "cef",
  "water_gal_per_cycle",
  "doe_adjusted_volume_cuft",
  "annual_cost_usd",
  "cost_basis",
] as const;

/** Catalogue spec fields with genuine service/identification value. */
export const VAD_KEPT_SPEC_FIELDS: Record<string, string> = {
  voltage: "Voltage",
  amperage: "Amperage",
  width_in: "Width (in)",
  height_in: "Height (in)",
  depth_in: "Depth (in)",
  installation_type: "Installation type",
  capacity_cuft: "Capacity (cu ft)",
  total_volume_cuft: "Total volume (cu ft)",
  advertised_volume_cuft: "Advertised volume (cu ft)",
  place_settings: "Place settings",
  load_type: "Load type",
  style: "Style",
  defrost: "Defrost type",
  icemaker: "Icemaker",
  tub_material: "Tub material",
  drying_method: "Drying method",
  soil_sensing: "Soil sensing",
  type: "Type",
  cooking_zones: "Cooking zones",
  cooktop_tech: "Cooktop technology",
  control_type: "Control type",
  gas_burner_btu_per_hr: "Gas burner (BTU/hr)",
  auto_termination_controls: "Auto-termination controls",
  smart_capabilities: "Smart capabilities",
};

export type ExclusionCounters = { energy: number; shopping: number };

export type VadPartRef = { part_number: string; type: string };

export type VadFailure = {
  component: string;
  serviceLevel: string | null;
  note: string | null;
  noPartFix: string | null;
  checks: string[];
  safety: string[];
  tools: string[];
  steps: string[];
  verification: string | null;
  manualReference: { text: string; url: string | null } | null;
  video: { title: string; url: string | null; publisher: string | null } | null;
  partNumbers: VadPartRef[];
};

export type VadModelRecord = {
  kind: "model";
  scope: "model";
  url: string;
  slug: string;
  brand: string;
  modelNumber: string;
  applianceType: string | null;
  manuals: { title: string; url: string; note: string | null }[];
  symptoms: { symptom: string; components: string[] }[];
  failures: VadFailure[];
  sourceNote: string | null;
  excluded: ExclusionCounters;
};

export type VadCategoryCause = {
  component: string;
  attentionShare: string | null;
  howToCheck: string | null;
  meaning: string | null;
};

export type VadCategoryRecord = {
  kind: "category";
  scope: "category";
  url: string;
  brand: string;
  applianceType: string;
  symptom: string;
  title: string;
  safety: string | null;
  mostLikelyCause: string | null;
  freeChecks: string[];
  causes: VadCategoryCause[];
  excluded: ExclusionCounters;
};

// ---------------------------------------------------------------- helpers

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  middot: "·",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  rsaquo: "›",
  deg: "°",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[String(n).toLowerCase()] ?? m);
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function listItems(html: string): string[] {
  return items(html);
}

function items(html: string): string[] {
  return [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => stripTags(m[1] ?? ""))
    .filter(Boolean);
}

/** Slug segment -> display text ("gas-dryer" -> "Gas dryer"). */
export function slugToLabel(slug: string): string {
  const s = slug.replace(/-/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Text of the first list that follows a bolded label inside a block. */
function labelledList(block: string, label: string): string[] {
  const re = new RegExp(`<b>\\s*${label}[^<]*<\\/b>[\\s\\S]{0,200}?<(ol|ul)\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
  const m = re.exec(block);
  return m ? listItems(m[2] ?? "") : [];
}

function labelledText(block: string, label: string): string | null {
  const re = new RegExp(`<b>\\s*${label}[^<]*<\\/b>([\\s\\S]*?)<\\/p>`, "i");
  const m = re.exec(block);
  const t = m ? stripTags(m[1] ?? "") : "";
  return t || null;
}

/** Strip the "($8)" cost annotations retailers/tool lists carry. */
function stripCosts(s: string): string {
  return s.replace(/\s*\(\$[\d.,]+\)/g, "").trim();
}

function countMatches(html: string, re: RegExp): number {
  return (html.match(re) ?? []).length;
}

const PRICE_RE = /\$\s?\d[\d.,]*/g;
const BUY_RE = /class="(?:buy|vbuy)"|rel="[^"]*sponsored/gi;
const ENERGY_RE =
  /kwh|energy\s?star|annual (?:energy|running) cost|imef|iwf|\bcef\b|energyguide|efficien|cost to run|\$\/yr|per year to run/gi;

/** Sections whose purpose is shopping, not repair. */
function dropShoppingSections(html: string): { html: string; dropped: number } {
  let dropped = 0;
  let out = html;
  const drop = (re: RegExp) => {
    out = out.replace(re, () => {
      dropped += 1;
      return " ";
    });
  };
  drop(/<div class="scroll">[\s\S]*?<\/table>\s*<\/div>/gi); // price tables
  drop(/<p[^>]*class="[^"]*(?:worth|disc)[^"]*"[\s\S]*?<\/p>/gi);
  drop(/<div class="buyrow"[\s\S]*?<\/div>\s*<\/div>/gi);
  drop(/<h2[^>]*>\s*If you replace it instead[\s\S]*$/i);
  return { html: out, dropped };
}

// ------------------------------------------------------- model repair page

export function parseVadModelPage(html: string, url: string): VadModelRecord | null {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!h1) return null;
  const heading = stripTags(h1[1] ?? "");
  if (!heading || /page not found/i.test(heading)) return null;

  const slugParts = url.replace(/\/+$/, "").split("/");
  const modelSlug = slugParts[slugParts.length - 1] ?? "";
  const brandSlug = slugParts[slugParts.length - 2] ?? "";

  const modelNumber = heading.split(/\s+/).pop() ?? modelSlug.toUpperCase();
  const brand = heading.slice(0, heading.length - modelNumber.length).trim() || brandSlug;

  const sub = /<p class="sub">([\s\S]*?)<\/p>/i.exec(html);
  const applianceType = sub ? (stripTags(sub[1] ?? "").split("·")[0] ?? "").trim() || null : null;

  // Manual references: link + context only. The document itself is never copied.
  const manuals: { title: string; url: string; note: string | null }[] = [];
  for (const m of html.matchAll(/<p class="meta">\s*Owner's manual:([\s\S]*?)<\/p>/gi)) {
    const seg = m[1] ?? "";
    const a = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*)/i.exec(seg);
    if (a) manuals.push({ url: a[1] ?? "", title: stripTags(a[2] ?? ""), note: stripTags(a[3] ?? "") || null });
  }

  const symptoms: { symptom: string; components: string[] }[] = [];
  const symptomBlock = /<h2>\s*What is it doing\?\s*<\/h2>\s*<ul>([\s\S]*?)<\/ul>/i.exec(html);
  if (symptomBlock) {
    for (const li of [...(symptomBlock[1] ?? "").matchAll(/<li>([\s\S]*?)<\/li>/gi)]) {
      const text = stripTags(li[1] ?? "");
      const [sym, comps] = text.split("—");
      if (!sym?.trim()) continue;
      symptoms.push({
        symptom: sym.trim(),
        components: (comps ?? "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      });
    }
  }

  const excluded: ExclusionCounters = { energy: 0, shopping: 0 };
  const failures: VadFailure[] = [];

  const cardsRaw = html.split(/<div class="card">/i).slice(1);
  for (const raw of cardsRaw) {
    excluded.shopping += countMatches(raw, PRICE_RE) + countMatches(raw, BUY_RE);
    excluded.energy += countMatches(raw, ENERGY_RE);

    // Part numbers survive the shopping strip — they are service data.
    const partNumbers: VadPartRef[] = [];
    const seen = new Set<string>();
    for (const row of raw.matchAll(/<td><code>([^<]+)<\/code><\/td><td>([^<]*)<\/td>/gi)) {
      const pn = stripTags(row[1] ?? "");
      const type = stripTags(row[2] ?? "");
      const key = `${pn}|${type}`;
      if (!pn || seen.has(key)) continue;
      seen.add(key);
      partNumbers.push({ part_number: pn, type });
    }

    const { html: card } = dropShoppingSections(raw);

    const h3 = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(card);
    const component = h3 ? stripTags(h3[1] ?? "") : "";
    if (!component) continue;

    const pill = /<span class="pill[^"]*">([\s\S]*?)<\/span>/i.exec(card);
    const firstP = /<\/span>\s*<p>([\s\S]*?)<\/p>/i.exec(card);
    const free = /<div class="free">([\s\S]*?)<\/div>/i.exec(card);

    const manualRef = /<b>\s*In your manual:\s*<\/b>\s*(?:<a[^>]*href="([^"]*)"[^>]*>)?([\s\S]*?)<\/(?:a|p)>/i.exec(
      card,
    );
    const videoBlock = /<b>\s*Component demonstration\s*<\/b>([\s\S]*?)<\/p>/i.exec(card);
    let video: VadFailure["video"] = null;
    if (videoBlock) {
      const seg = videoBlock[1] ?? "";
      const a = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(seg);
      const pub = /<span class="src">([\s\S]*?)<\/span>/i.exec(seg);
      if (a) video = { title: stripTags(a[2] ?? ""), url: a[1] ?? null, publisher: pub ? stripTags(pub[1] ?? "") : null };
    }

    failures.push({
      component,
      serviceLevel: pill ? stripTags(pill[1] ?? "") : null,
      note: firstP ? stripTags(firstP[1] ?? "") : null,
      noPartFix: free ? stripTags((free[1] ?? "").replace(/<b>[\s\S]*?<\/b>/i, "")) || null : null,
      checks: labelledList(card, "Check, in this order"),
      safety: labelledList(card, "Before you open anything"),
      tools: labelledList(card, "Tools").map(stripCosts),
      steps: labelledList(card, "The repair, in order"),
      verification: labelledText(card, "How you know it worked\\."),
      manualReference: manualRef
        ? { text: stripTags(manualRef[2] ?? ""), url: manualRef[1] ?? null }
        : null,
      video,
      partNumbers,
    });
  }

  const note = /Where this comes from\.<\/b>([\s\S]*?)<\/p>/i.exec(html);
  excluded.shopping += countMatches(html.split(/<div class="card">/i)[0] ?? "", BUY_RE);
  excluded.energy += countMatches(html.replace(/<div class="card">[\s\S]*/i, ""), ENERGY_RE);

  return {
    kind: "model",
    scope: "model",
    url,
    slug: modelSlug,
    brand,
    modelNumber,
    applianceType,
    manuals,
    symptoms,
    failures,
    sourceNote: note ? stripTags(note[1] ?? "") : null,
    excluded,
  };
}

// ---------------------------------------------------- category repair guide

export function parseVadFixPage(html: string, url: string): VadCategoryRecord | null {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!h1) return null;
  const title = stripTags(h1[1] ?? "");
  if (!title || /page not found/i.test(title)) return null;

  const parts = url.replace(/\/+$/, "").split("/");
  const symptom = (parts[parts.length - 1] ?? "").replace(/-/g, " ");
  const applianceType = slugToLabel(parts[parts.length - 2] ?? "");
  const brand = slugToLabel(parts[parts.length - 3] ?? "");
  if (!symptom || !applianceType || !brand) return null;

  const excluded: ExclusionCounters = {
    energy: countMatches(html, ENERGY_RE),
    shopping: countMatches(html, PRICE_RE) + countMatches(html, BUY_RE),
  };

  const safety = /<p class="safety">([\s\S]*?)<\/p>/i.exec(html);
  const vname = /<h2 class="vname">([\s\S]*?)<\/h2>/i.exec(html);
  const freeBlock = /<ol class="freechecks">([\s\S]*?)<\/ol>/i.exec(html);

  const causes: VadCategoryCause[] = [];
  for (const raw of html.split(/<details class="cause"/i).slice(1)) {
    const cn = /<span class="cn">([\s\S]*?)<\/span>/i.exec(raw);
    if (!cn) continue;
    const rank = /<span class="pill rank">([\s\S]*?)<\/span>/i.exec(raw);
    const test = /<p class="test">([\s\S]*?)<\/p>/i.exec(raw);
    const means = /<p class="means">([\s\S]*?)<\/p>/i.exec(raw);
    causes.push({
      component: stripTags(cn[1] ?? ""),
      attentionShare: rank ? stripTags(rank[1] ?? "") : null,
      howToCheck: test ? stripTags((test[1] ?? "").replace(/<b>[\s\S]*?<\/b>/i, "")) || null : null,
      meaning: means ? stripTags(means[1] ?? "") || null : null,
    });
  }

  return {
    kind: "category",
    scope: "category",
    url,
    brand,
    applianceType,
    symptom,
    title,
    safety: safety ? stripTags(safety[1] ?? "") : null,
    mostLikelyCause: vname ? stripTags(vname[1] ?? "") : null,
    freeChecks: freeBlock ? listItems(freeBlock[1] ?? "") : [],
    causes,
    excluded,
  };
}

// ------------------------------------------------------------- catalogue

export type VadCatalogIdentity = {
  slug: string;
  url: string;
  brand: string;
  category: string;
  modelNumber: string;
  modelNumberNorm: string;
  fuel: string | null;
  upc: string | null;
  dateCertified: string | null;
  specs: Record<string, string | number | boolean>;
  excludedEnergyFields: number;
};

/** Keep only identification / physical / electrical fields from a catalogue row. */
export function sanitizeCatalogProduct(row: Record<string, any>): VadCatalogIdentity {
  const specs: Record<string, string | number | boolean> = {};
  let excluded = 0;
  for (const [k, v] of Object.entries((row["specs"] ?? {}) as Record<string, unknown>)) {
    if ((VAD_EXCLUDED_CATALOG_FIELDS as readonly string[]).includes(k)) {
      excluded += 1;
      continue;
    }
    if (!(k in VAD_KEPT_SPEC_FIELDS)) continue;
    if (v === null || v === undefined || v === "") continue;
    specs[k] = v as string | number | boolean;
  }
  for (const k of VAD_EXCLUDED_CATALOG_FIELDS) if (k in row) excluded += 1;

  return {
    slug: String(row["slug"] ?? ""),
    url: String(row["url"] ?? ""),
    brand: String(row["brand"] ?? ""),
    category: String(row["category"] ?? ""),
    modelNumber: String(row["model_number"] ?? ""),
    modelNumberNorm: String(row["model_number_norm"] ?? row["model_number"] ?? ""),
    fuel: (row["fuel"] as string | null) ?? null,
    upc: (row["upc"] as string | null) ?? null,
    dateCertified: (row["date_certified"] as string | null) ?? null,
    specs,
    excludedEnergyFields: excluded,
  };
}

// ------------------------------------------------------- document builders

function bullets(items: string[]): string {
  return items.map((i) => `- ${i}`).join("\n");
}

export function buildModelDocument(rec: VadModelRecord, identity: VadCatalogIdentity | null, retrievedAt: string): string {
  const out: string[] = [];
  out.push(`# ${rec.brand} ${rec.modelNumber} — external repair reference`);
  out.push(
    [
      `Source: ${VAD_SOURCE_NAME} (${rec.url})`,
      `Retrieved: ${retrievedAt}`,
      `Scope: model-specific unless a section says otherwise`,
      `Evidence class: external published repair reference — not a manufacturer service procedure and not a technician-verified repair.`,
      `Energy-efficiency and consumer purchasing information from this source is deliberately excluded.`,
    ].join("\n"),
  );

  out.push(
    [
      "## Model identity (scope: model)",
      `Brand: ${rec.brand}`,
      rec.applianceType ? `Appliance type: ${rec.applianceType}` : "",
      `Model number: ${rec.modelNumber}`,
      identity?.upc ? `UPC: ${identity.upc}` : "",
      identity?.fuel ? `Fuel: ${identity.fuel}` : "",
      identity?.category ? `Product category: ${identity.category}` : "",
      ...Object.entries(identity?.specs ?? {}).map(
        ([k, v]) => `${VAD_KEPT_SPEC_FIELDS[k] ?? k}: ${String(v)}`,
      ),
    ]
      .filter(Boolean)
      .join("\n"),
  );

  if (rec.manuals.length) {
    out.push(
      [
        "## Manufacturer documentation references (scope: model)",
        "Links only — the referenced documents are not reproduced here.",
        ...rec.manuals.map((m) => `- ${m.title}${m.note ? ` ${m.note}` : ""} — ${m.url}`),
      ].join("\n"),
    );
  }

  if (rec.symptoms.length) {
    out.push(
      [
        "## Reported symptoms and the components this source associates with them (scope: model)",
        ...rec.symptoms.map((s) => `- Symptom: ${s.symptom} — associated components: ${s.components.join(", ")}`),
      ].join("\n"),
    );
  }

  for (const f of rec.failures) {
    const lines = [
      `## Documented failure point: ${f.component} (scope: model, source-reported)`,
      "This is a repair-attention observation published by an external source, not a measured failure rate and not a confirmed repair on this machine.",
      f.serviceLevel ? `Service level: ${f.serviceLevel}` : "",
      f.note ? `Escalation guidance: ${f.note}` : "",
      f.noPartFix ? `No-part fix to try first: ${f.noPartFix}` : "",
      f.checks.length ? `Diagnostic checks in order:\n${bullets(f.checks)}` : "",
      f.safety.length ? `Safety before opening:\n${bullets(f.safety)}` : "",
      f.tools.length ? `Tools:\n${bullets(f.tools)}` : "",
      f.steps.length ? `Repair procedure in order:\n${bullets(f.steps)}` : "",
      f.verification ? `Verification that the repair worked: ${f.verification}` : "",
      f.manualReference ? `Manual reference: ${f.manualReference.text}${f.manualReference.url ? ` — ${f.manualReference.url}` : ""}` : "",
      f.video ? `Component procedure video: ${f.video.title}${f.video.publisher ? ` (${f.video.publisher})` : ""}${f.video.url ? ` — ${f.video.url}` : ""}` : "",
      f.partNumbers.length
        ? `Associated part numbers: ${f.partNumbers.map((p) => `${p.part_number}${p.type ? ` (${p.type})` : ""}`).join(", ")}`
        : "",
    ];
    out.push(lines.filter(Boolean).join("\n"));
  }

  out.push(
    [
      "## Source provenance",
      `Source name: ${VAD_SOURCE_NAME}`,
      `Source URL: ${rec.url}`,
      `Retrieved: ${retrievedAt}`,
      `License: ${VAD_LICENSE}`,
      rec.sourceNote ? `Publisher's own sourcing note: ${rec.sourceNote}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return out.join("\n\n").trim();
}

export function buildCategoryDocument(rec: VadCategoryRecord, retrievedAt: string): string {
  const out: string[] = [];
  out.push(`# ${rec.brand} ${rec.applianceType} — ${rec.symptom} (category-level repair guide)`);
  out.push(
    [
      `Source: ${VAD_SOURCE_NAME} (${rec.url})`,
      `Retrieved: ${retrievedAt}`,
      `SCOPE: category-general for ${rec.brand} ${rec.applianceType}. Nothing in this document is a verified failure on any individual model.`,
      `Evidence class: external published repair reference.`,
    ].join("\n"),
  );

  if (rec.safety) out.push(`## Safety (scope: category)\n${rec.safety}`);
  if (rec.mostLikelyCause)
    out.push(
      `## Most commonly reported cause (scope: category)\n${rec.mostLikelyCause}\nReported as the most common cause for this brand/appliance/symptom combination generally — not for a specific model.`,
    );
  if (rec.freeChecks.length)
    out.push(`## Checks that cost nothing (scope: category)\n${bullets(rec.freeChecks)}`);

  for (const c of rec.causes) {
    out.push(
      [
        `## Commonly reported failure point: ${c.component} (scope: category — ${rec.brand} ${rec.applianceType})`,
        c.attentionShare ? `Repair-attention ranking (a prioritisation signal, NOT a measured failure rate): ${c.attentionShare}` : "",
        c.howToCheck ? `How to check: ${c.howToCheck}` : "",
        c.meaning ? `What a failure of this component means for the symptom "${rec.symptom}": ${c.meaning}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  out.push(
    [
      "## Source provenance",
      `Source name: ${VAD_SOURCE_NAME}`,
      `Source URL: ${rec.url}`,
      `Retrieved: ${retrievedAt}`,
      `License: ${VAD_LICENSE}`,
      `Scope: category-general`,
    ].join("\n"),
  );

  return out.join("\n\n").trim();
}
