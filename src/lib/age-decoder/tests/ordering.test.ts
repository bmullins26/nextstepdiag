import { test, expect, describe } from "bun:test";
import { decodeAge } from "../decode";
import { parsePlateDate, selectDate } from "../select";
import { staticModelWindow } from "../oem-timelines";
import { NOW } from "./fixtures";

const LG = { brand: "LG", serial: "603KWWZ73713", now: NOW }; // {2026, 2016, 2006}

describe("strict date order", () => {
  test("typed plate date 2019.03 wins outright over an LG 2019/2009 serial", () => {
    const out = decodeAge({ brand: "LG", serial: "903KWWZ73713", now: NOW, evidence: { plateDate: parsePlateDate("2019.03", NOW) } });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect([out.manufactureYear, out.manufactureMonth, out.dateSource]).toEqual([2019, 3, "plate_printed"]);
  });

  test("tech-confirmed window 2014–2018 narrows LG 603… to Mar 2016", () => {
    const out = decodeAge({ ...LG, modelWindow: { modelPrefix: "WM3900HW", introducedYear: null, discontinuedYear: null, kind: "tech_confirmed", evidenceCount: 1, observedMinYear: 2014, observedMaxYear: 2018 } });
    expect(out.status === "ok" && [out.manufactureYear, out.manufactureMonth]).toEqual([2016, 3]);
  });

  test("a window with zero confirmations is not used", () => {
    const out = decodeAge({ ...LG, modelWindow: { modelPrefix: "WM", introducedYear: null, discontinuedYear: null, kind: "tech_confirmed", evidenceCount: 0, observedMinYear: 2014, observedMaxYear: 2018 } });
    expect(out.status).toBe("ambiguous");
  });

  test("a window cannot pick between candidates under 5 years apart", () => {
    const sel = selectDate([{ year: 2016 }, { year: 2019 }], null, { modelPrefix: "X", introducedYear: 2015, discontinuedYear: 2017, kind: "owner" }, NOW);
    expect(sel.kind).toBe("ambiguous");
  });

  test("receipt 2018 with {2026, 2016} leaves only 2016", () => {
    const sel = selectDate([{ year: 2026, month: 3 }, { year: 2016, month: 3 }], { receiptBy: { year: 2018 } }, null, NOW);
    expect(sel.kind === "ok" && sel.chosen.year).toBe(2016);
  });

  test("a ship date removes later candidates and is never the build date", () => {
    const sel = selectDate([{ year: 2026, month: 1 }, { year: 1996, month: 1 }], { shippedBy: { year: 2025, month: 6 } }, null, NOW);
    expect(sel.kind === "ok" && sel.chosen.year).toBe(1996);
    expect(sel.kind === "ok" && sel.source).toBe("serial");
  });

  test("factory record outranks a receipt but not a plate date", () => {
    expect(selectDate([{ year: 2016 }], { factory: { year: 2017, month: 2 }, receiptBy: { year: 2016 } }, null, NOW)).toMatchObject({ kind: "ok", source: "factory_record" });
    expect(selectDate([], { factory: { year: 2017 }, plateDate: { year: 2016, month: 5 } }, null, NOW)).toMatchObject({ kind: "ok", source: "plate_printed", chosen: { year: 2016 } });
  });

  test("one prior data-plate report decides (plate_printed_prior)", () => {
    const out = decodeAge({ ...LG, evidence: { priorPlate: [{ year: 2016, month: 3 }] } });
    expect(out.status === "ok" && [out.manufactureYear, out.dateSource]).toEqual([2016, "plate_printed_prior"]);
  });

  test("two disagreeing prior data-plate reports → ambiguous, no pick", () => {
    const out = decodeAge({ ...LG, evidence: { priorPlate: [{ year: 2016, month: 3 }, { year: 2006, month: 3 }] } });
    expect(out.status).toBe("ambiguous");
    expect(out.candidates.map((c) => c.year).sort()).toEqual([2006, 2016]);
  });

  test("Sub-Zero/Wolf official timeline narrows ≥5-year-apart candidates; open last year = now", () => {
    const w = staticModelWindow("Wolf", "GR304"); // 2013–current
    const sel = selectDate([{ year: 2021 }, { year: 2009 }], null, w, NOW);
    expect(sel.kind === "ok" && sel.chosen.year).toBe(2021);
  });

  test("plate date wins even when the serial format is unknown", () => {
    const out = decodeAge({ brand: "Haier", serial: "SM554374", now: NOW, evidence: { plateDate: { year: 2020, month: 4 } } });
    expect(out.status === "ok" && out.manufactureYear).toBe(2020);
  });
});

describe("plate date parsing", () => {
  test.each([
    ["2019.03", 2019, 3], ["03/2019", 2019, 3], ["MFD 2019-03", 2019, 3], ["FD0103", 2021, 3], ["FD9405", 2014, 5], ["2019", 2019, null],
  ] as const)("%s", (raw, y, m) => {
    expect(parsePlateDate(raw, NOW)).toEqual({ year: y, month: m });
  });
  test("rejects future and garbage", () => {
    expect(parsePlateDate("2031.01", NOW)).toBeNull();
    expect(parsePlateDate("hello", NOW)).toBeNull();
    expect(parsePlateDate("13/2019", NOW)).toBeNull();
  });
});
