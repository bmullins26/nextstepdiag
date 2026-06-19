export type Fixture = {
  label: string;
  brand: string;
  model?: string;
  serial: string;
  now: Date;
  expect: {
    status: "ok" | "unknown";
    year?: number;
    month?: number | null;
    week?: number | null;
    confidence?: "High" | "Medium" | "Low" | "Unknown";
    ruleId?: string;
    unknownReason?: string;
  };
};

const NOW = new Date("2026-06-01T00:00:00Z");

export const fixtures: Fixture[] = [
  {
    label: "Whirlpool letter-year/week (modern)",
    brand: "Whirlpool",
    model: "WDT750SAKZ0",
    serial: "CC1212345",
    now: NOW,
    expect: { status: "ok", year: 2015, week: 12, ruleId: "whirlpool.year-letter-week" },
  },
  {
    label: "GE month/year letters",
    brand: "GE",
    model: "GDT695SSJSS",
    serial: "AD123456",
    now: NOW,
    expect: { status: "ok", year: 2024, month: 1, ruleId: "ge.month-year-letters" },
  },
  {
    label: "Frigidaire YYWW",
    brand: "Frigidaire",
    model: "FFTR1814TW",
    serial: "24151234567",
    now: NOW,
    expect: { status: "ok", year: 2024, week: 15, confidence: "High", ruleId: "frigidaire.yy-ww" },
  },
  {
    label: "LG YYM (Dec)",
    brand: "LG",
    model: "LRFXS2503S",
    serial: "24C12345678",
    now: NOW,
    expect: { status: "ok", year: 2024, month: 12, confidence: "High", ruleId: "lg.yym" },
  },
  {
    label: "LG legacy Y+MM (909... → Sept 2009, multi-candidate → best-guess Low confidence without corroboration)",
    brand: "LG",
    model: "WM0642HW/02",
    serial: "909KWAT04496",
    now: NOW,
    // Without corroboration, three candidates (1999/2009/2019) → Low. We now
    // surface the most recent (2019) as a best guess instead of unknown.
    expect: { status: "ok", year: 2019, month: 9, confidence: "Low", ruleId: "lg.legacy.ymm" },
  },
  {
    label: "Kenmore Whirlpool-built (model 110…) routes to Whirlpool rules",
    brand: "Kenmore",
    model: "11092573210",
    serial: "CF2328200",
    now: NOW,
    // F = letter index 5 → 1978/1998/2018 candidates. Pure decoder (no
    // corroboration) picks most recent (2018) with Medium confidence. The
    // server fn calls Firecrawl to disambiguate in production.
    expect: { status: "ok", confidence: "Medium", ruleId: "whirlpool.year-letter-week" },
  },
  {
    label: "Samsung pos-7 year / pos-8 month",
    brand: "Samsung",
    model: "RF28R7551SR",
    serial: "0H4A12C5123456",
    now: NOW,
    expect: { status: "ok", year: 2024, month: 5, confidence: "High", ruleId: "samsung.pos7-year-pos8-month" },
  },
  {
    label: "Bosch FD code",
    brand: "Bosch",
    model: "SHPM88Z75N",
    serial: "FD9512",
    now: NOW,
    expect: { status: "ok", year: 2015, month: 12, confidence: "High", ruleId: "bsh.fd-code" },
  },
  {
    label: "Bosch missing FD code",
    brand: "Bosch",
    model: "SHPM88Z75N",
    serial: "00123456",
    now: NOW,
    expect: { status: "unknown", unknownReason: "invalid_serial_format" },
  },
  {
    label: "Unsupported brand",
    brand: "Acme",
    model: "X1",
    serial: "12345",
    now: NOW,
    expect: { status: "unknown", unknownReason: "unsupported_manufacturer" },
  },
];