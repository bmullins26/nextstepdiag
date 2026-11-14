import { test, expect } from "bun:test";
import { decodeAge } from "../decode";
const now = new Date("2026-06-01");

test("Bradford White lists every recycled year", () => {
  const r = decodeAge({ brand: "Bradford White", serial: "KA1234567", now });
  expect(r.status).toBe("ambiguous");
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
  expect(r.status).toBe("ambiguous");
  expect(r.appliedRule?.family).toBe("LG");
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
  expect(r.status).toBe("ambiguous");
  expect(r.candidates.map((c) => c.year)).toEqual(expect.arrayContaining([2023, 2013]));
});
test("LG 112TNUW1W694 → Dec 2021 or 2011 (no recency pick)", () => {
  const r = decodeAge({ brand: "LG", model: "WT7150CW", serial: "112TNUW1W694", now });
  expect(r.status).toBe("ambiguous");
  expect(r.candidates.every((c) => c.month === 12)).toBe(true);
  expect(r.candidates.map((c) => c.year)).toEqual(expect.arrayContaining([2021, 2011]));
});
test("GE MZ460306 → July, 2024 or 2012", () => {
  const r = decodeAge({ brand: "GE", model: "GSS25IYNZHFS", serial: "MZ460306", now });
  expect(r.status).toBe("ambiguous");
  expect(r.candidates.every((c) => c.month === 7)).toBe(true);
  expect(r.candidates.map((c) => c.year)).toEqual(expect.arrayContaining([2024, 2012]));
});
test("GE AS321543N → January, 2021 among candidates", () => {
  const r = decodeAge({ brand: "GE", model: "GFW650SSN1WW", serial: "AS321543N", now });
  expect(r.status).toBe("ambiguous");
  expect(r.candidates.some((c) => c.year === 2021 && c.month === 1)).toBe(true);
});
// Nov 2026 accuracy pass — Fisher & Paykel, Dacor, Sub-Zero/Wolf timelines.
import { staticModelWindow } from "../oem-timelines";
test("Fisher & Paykel AD852242C → year ending 8, no guessed month", () => {
  const r = decodeAge({ brand: "Fisher & Paykel", model: "DE7027J1US0", serial: "AD852242C", now });
  expect(r.status).toBe("ambiguous");
  const years = r.candidates.map((c) => c.year).sort();
  expect(years).toEqual([1998, 2008, 2018]);
  expect(r.candidates.every((c) => c.month == null)).toBe(true);
});
test("Fisher & Paykel decade narrowed by production window", () => {
  const r = decodeAge({ brand: "Fisher & Paykel", serial: "AD852242C", now,
    modelWindow: { modelPrefix: "DE7027", introducedYear: 2015, discontinuedYear: null } });
  expect(r.status === "ok" && r.manufactureYear).toBe(2018);
});
test("Fisher & Paykel model prefix inferred when brand blank", () => {
  const r = decodeAge({ brand: "", model: "DE7027J1US0", serial: "AD852242C", now });
  expect(r.status).toBe("ambiguous");
});
test("Dacor FB08040263 → 2008 week 4", () => {
  const r = decodeAge({ brand: "Dacor", serial: "FB08040263", now });
  expect(r.status === "ok" && r.manufactureYear).toBe(2008);
  expect(r.status === "ok" && r.manufactureWeek).toBe(4);
});
test("Sub-Zero says no serial date code and gives official window", () => {
  const w = staticModelWindow("Sub-Zero", "BI-36UFD/S/TH");
  expect(w?.introducedYear).toBe(2012);
  expect(w?.discontinuedYear).toBe(2022);
  const r = decodeAge({ brand: "Sub-Zero", model: "BI-36UFD/S/TH", serial: "1234567", now, modelWindow: w });
  expect(r.status).toBe("unknown");
  expect(r.status === "unknown" && r.unknownReason).toBe("missing_date_code");
  expect(r.breakdown).toContain("2012–2022");
});
test("Sub-Zero longest-prefix match: BI-36UFDID starts 2016", () => {
  expect(staticModelWindow("Sub Zero", "BI-36UFDID/O")?.introducedYear).toBe(2016);
});
test("Wolf GR304 is current production from 2013", () => {
  const w = staticModelWindow("Wolf", "GR304");
  expect(w?.introducedYear).toBe(2013);
  expect(w?.discontinuedYear).toBe(null);
});
test("Timeline is not applied to other brands", () => {
  expect(staticModelWindow("GE", "GR304")).toBe(null);
});
