import { test, expect } from "bun:test";
import { canonicalBrandKey, windowModelKey, resolveBrand } from "../registry";
import { decodeAge, normalizeSerial } from "../decode";
import { NOW } from "./fixtures";

test("model key normalization", () => {
  expect(windowModelKey("MTW6205RW1")).toBe("MTW6205RW");
  expect(windowModelKey("WT7150CW /03")).toBe("WT7150CW");
  expect(windowModelKey("WT7150CW/03")).toBe("WT7150CW");
  expect(windowModelKey("GSS25IYNZHFS")).toBe("GSS25IYNZHFS");
});

test("canonical brand keys shared across aliases", () => {
  expect(canonicalBrandKey("GE Appliances")).toBe("ge");
  expect(canonicalBrandKey("GE")).toBe("ge");
  expect(canonicalBrandKey("Kenmore", "795.7554440")).toBe("lg");
  expect(canonicalBrandKey("Kenmore", "592.12345")).toBe("samsung");
  expect(canonicalBrandKey("Kenmore", "999.12345")).toBeNull();
  expect(canonicalBrandKey("Kenmore", "596.12345")).toBeNull();
  expect(canonicalBrandKey("Kenmore", "647.12345")).toBeNull();
  expect(canonicalBrandKey("Magic Chef")).toBe("maytag_legacy");
  expect(resolveBrand("Haier")).toBeNull();
  for (const b of ["Bravos", "Cabrio", "Neptune", "Norge", "Whirlpool Corporation"]) expect(resolveBrand(b)).toBe("whirlpool");
  expect(resolveBrand("Alliance Laundry")).toBe("alliance");
});

test("Magic Chef decodes only via the older Maytag rule", () => {
  expect(decodeAge({ brand: "Magic Chef", serial: "12772864EL", now: NOW }).status).toBe("ambiguous");
  expect(decodeAge({ brand: "Magic Chef", serial: "CR2512345", now: NOW }).status).toBe("unknown");
});

test("serial normalization: uppercase, strip spaces/dashes/dots; O→0 / I→1 only in digit positions", () => {
  expect(normalizeSerial(" cr-25.12 345 ")).toBe("CR2512345");
  const out = decodeAge({ brand: "Whirlpool", serial: "MX0640478", now: NOW });
  const fixed = decodeAge({ brand: "Whirlpool", serial: "MXO640478", now: NOW });
  expect(fixed.status).toBe(out.status);
  expect(fixed.normalizedSerial).toBe("MX0640478");
  // Letter positions keep their O / I.
  expect(decodeAge({ brand: "Whirlpool", serial: "IO2512345", now: NOW }).normalizedSerial?.slice(0, 2)).toBe("IO");
});
