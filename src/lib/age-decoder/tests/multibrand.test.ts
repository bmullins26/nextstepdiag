import { test, expect } from "bun:test";
import { decodeAge } from "../decode";
const now = new Date("2026-06-01");

test("Bradford White lists every recycled year", () => {
  const r = decodeAge({ brand: "Bradford White", serial: "KA1234567", now });
  expect(r.status).toBe("ok");
  const years = r.candidates.map((c) => c.year).sort();
  expect(years).toEqual([1973, 1993, 2013]);
});
test("Speed Queen YYMM", () => {
  const r = decodeAge({ brand: "Speed Queen", serial: "1508012345", now });
  expect(r.status === "ok" && r.manufactureYear).toBe(2015);
  expect(r.status === "ok" && r.manufactureMonth).toBe(8);
});
test("Carrier WWYY", () => {
  const r = decodeAge({ brand: "Bryant", serial: "4218A12345", now });
  expect(r.status === "ok" && r.manufactureYear).toBe(2018);
});
test("Kenmore 796 routes to LG", () => {
  const r = decodeAge({ brand: "Kenmore", model: "796.41272900", serial: "309KWAA12345", now });
  expect(r.status).toBe("ok");
});

// Real-world audit samples (Nov 2026).
const pick = (r: ReturnType<typeof decodeAge>) => (r.status === "ok" ? { y: r.manufactureYear, m: r.manufactureMonth, all: r.candidates.map((c) => c.year) } : null);
test("Samsung range 0C8K7DDG301617M → March 2015", () => {
  const r = pick(decodeAge({ brand: "Samsung", model: "NX58J7750SS", serial: "0C8K7DDG301617M", now }));
  expect(r?.y).toBe(2015); expect(r?.m).toBe(3);
});
test("Samsung dryer 0AYD5BBR500025Y → May 2021", () => {
  const r = pick(decodeAge({ brand: "Samsung", model: "DVG45R6100W/A3", serial: "0AYD5BBR500025Y", now }));
  expect(r?.y).toBe(2021); expect(r?.m).toBe(5);
});
test("Frigidaire inferred from FFGF model, VF34007940 → 2023", () => {
  const r = decodeAge({ brand: "", model: "FFGF3054TBJ", serial: "VF34007940", now });
  expect(r.status === "ok" && r.manufactureYear).toBe(2023);
  expect(r.candidates.map((c) => c.year)).toContain(2013);
});
test("LG 112TNUW1W694 → Dec 2021, not 2011", () => {
  const r = pick(decodeAge({ brand: "LG", model: "WT7150CW", serial: "112TNUW1W694", now }));
  expect(r?.y).toBe(2021); expect(r?.m).toBe(12);
});
test("GE MZ460306 → July, 2024 or 2012", () => {
  const r = pick(decodeAge({ brand: "GE", model: "GSS25IYNZHFS", serial: "MZ460306", now }));
  expect(r?.m).toBe(7); expect(r?.all).toEqual(expect.arrayContaining([2024, 2012]));
});
test("GE AS321543N → January 2021", () => {
  const r = pick(decodeAge({ brand: "GE", model: "GFW650SSN1WW", serial: "AS321543N", now }));
  expect(r?.y).toBe(2021); expect(r?.m).toBe(1);
});
test("Fisher & Paykel says unsupported, not invalid serial", () => {
  const r = decodeAge({ brand: "Fisher & Paykel", model: "DE7027J1US0", serial: "AD852242C", now });
  expect(r.status).toBe("unknown");
  expect(r.status === "unknown" && r.unknownReason).not.toBe("invalid_serial_format");
});
