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
