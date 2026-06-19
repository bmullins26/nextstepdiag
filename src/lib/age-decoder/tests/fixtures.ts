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