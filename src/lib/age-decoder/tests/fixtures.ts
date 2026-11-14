// AF-1 accuracy fixtures. now = 2026-11-13. Model blank unless given.
export type Fixture = {
  label: string;
  brand: string;
  model?: string;
  serial: string;
  expect:
    | { status: "ok"; year: number; month?: number | null; week?: number | null }
    | { status: "ambiguous"; first?: number; years?: number[]; includes?: Array<{ year: number; month?: number; week?: number }>; excludes?: number[]; week?: number }
    | { status: "unknown"; unknownReason?: string };
};

export const NOW = new Date("2026-11-13T12:00:00Z");

export const fixtures: Fixture[] = [
  // Whirlpool family — digit and dual-letter years are ambiguous (expected year first).
  // CF0104204 also has a second reading (source F, year 0, week 10) per the two-letter rule.
  { label: "Maytag MTW6205RW1 CF0104204 → Jan 2026 wk1 listed first", brand: "Maytag", model: "MTW6205RW1", serial: "CF0104204",
    expect: { status: "ambiguous", first: 2026, includes: [{ year: 2026, week: 1, month: 1 }, { year: 1996, week: 1 }] } },
  { label: "Whirlpool C04101002 → 2010 wk41", brand: "Whirlpool", serial: "C04101002", expect: { status: "ambiguous", first: 2010, years: [2010, 1980, 1970], week: 41 } },
  { label: "Whirlpool CR2512345 → 2004 wk25 + source-letter reading 2012/1982 wk51", brand: "Whirlpool", serial: "CR2512345",
    expect: { status: "ambiguous", first: 2004, includes: [{ year: 2004, week: 25 }, { year: 2012, week: 51 }, { year: 1982, week: 51 }] } },
  { label: "Whirlpool CU2012345 → 2007 wk20 + 2012/1982 wk01", brand: "Whirlpool", serial: "CU2012345",
    expect: { status: "ambiguous", first: 2007, includes: [{ year: 2007, week: 20 }, { year: 2012, week: 1 }, { year: 1982, week: 1 }] } },
  { label: "Whirlpool FP5013998 → 2003 wk50 + 2015/1985 wk01", brand: "Whirlpool", serial: "FP5013998",
    expect: { status: "ambiguous", first: 2003, includes: [{ year: 2003, week: 50 }, { year: 2015, week: 1 }, { year: 1985, week: 1 }] } },
  { label: "Whirlpool MU5110613 → 2007 wk51 + 2015/1985 wk11", brand: "Whirlpool", serial: "MU5110613",
    expect: { status: "ambiguous", first: 2007, includes: [{ year: 2007, week: 51 }, { year: 2015, week: 11 }, { year: 1985, week: 11 }] } },
  { label: "Whirlpool R64597418 → 2016 wk45, never 2026", brand: "Whirlpool", serial: "R64597418", expect: { status: "ambiguous", first: 2016, years: [2016, 1986, 1976], excludes: [2026], week: 45 } },
  { label: "Whirlpool M92510000 → 2019 wk25, never 2029", brand: "Whirlpool", serial: "M92510000", expect: { status: "ambiguous", first: 2019, years: [2019, 1989, 1979], excludes: [2029], week: 25 } },
  { label: "Whirlpool MX06404786 → {2020, 1990} wk6", brand: "Whirlpool", serial: "MX06404786", expect: { status: "ambiguous", years: [2020, 1990], week: 6 } },
  { label: "Whirlpool HRC1848014 → {2023, 1993} wk18", brand: "Whirlpool", serial: "HRC1848014", expect: { status: "ambiguous", years: [2023, 1993], week: 18 } },
  // Older Maytag
  { label: "Amana NDE2330AYW 12772864EL → {Jun 2004, Jun 1980}", brand: "Amana", model: "NDE2330AYW", serial: "12772864EL",
    expect: { status: "ambiguous", years: [2004, 1980], includes: [{ year: 2004, month: 6 }, { year: 1980, month: 6 }] } },
  { label: "Jenn-Air JES8750BAB 16240783NR → {Sep 2008, Sep 1984}", brand: "Jenn-Air", model: "JES8750BAB", serial: "16240783NR",
    expect: { status: "ambiguous", years: [2008, 1984], includes: [{ year: 2008, month: 9 }, { year: 1984, month: 9 }] } },
  // Speed Queen
  { label: "Speed Queen commercial 520I000001DK → May 2015", brand: "Speed Queen", serial: "520I000001DK", expect: { status: "ok", year: 2015, month: 5 } },
  { label: "Speed Queen residential 1505000001 → May 2015", brand: "Speed Queen", serial: "1505000001", expect: { status: "ok", year: 2015, month: 5 } },
  { label: "Speed Queen commercial year letter outside table → read the plate", brand: "Speed Queen", serial: "520I000001GK", expect: { status: "unknown", unknownReason: "year_not_in_table" } },
  // Samsung
  { label: "Samsung J0V07DDD801404K → Aug 2013", brand: "Samsung", serial: "J0V07DDD801404K", expect: { status: "ok", year: 2013, month: 8 } },
  { label: "Samsung 0ARV5BBJ400798K → Apr 2017", brand: "Samsung", serial: "0ARV5BBJ400798K", expect: { status: "ok", year: 2017, month: 4 } },
  { label: "Samsung Y09S54AZ709271R → Jul 2010", brand: "Samsung", serial: "Y09S54AZ709271R", expect: { status: "ok", year: 2010, month: 7 } },
  { label: "Samsung Y09454BZ403285A → Apr 2010", brand: "Samsung", serial: "Y09454BZ403285A", expect: { status: "ok", year: 2010, month: 4 } },
  // Bosch / Thermador
  { label: "Bosch FD911100449 → Nov 2011", brand: "Bosch", serial: "FD911100449", expect: { status: "ok", year: 2011, month: 11 } },
  { label: "Bosch FD0103 → Mar 2021", brand: "Bosch", serial: "FD0103", expect: { status: "ok", year: 2021, month: 3 } },
  { label: "Thermador FD0509 → Sep 2025", brand: "Thermador", serial: "FD0509", expect: { status: "ok", year: 2025, month: 9 } },
  { label: "Bosch FD9405 → May 2014", brand: "Bosch", serial: "FD9405", expect: { status: "ok", year: 2014, month: 5 } },
  // Electrolux / Frigidaire (digit plant)
  { label: "Frigidaire 3F91400621 → includes 2009 wk14", brand: "Frigidaire", serial: "3F91400621", expect: { status: "ambiguous", includes: [{ year: 2009, week: 14 }] } },
  { label: "Electrolux 4D72904857 → includes 2017 wk29", brand: "Electrolux", serial: "4D72904857", expect: { status: "ambiguous", includes: [{ year: 2017, week: 29 }] } },
  // GE
  { label: "GE LR821547C → {2020, 2008, …}", brand: "GE", serial: "LR821547C", expect: { status: "ambiguous", includes: [{ year: 2020 }, { year: 2008 }] } },
  { label: "GE DD300093K → {2026, 2014, …}, never a single 0 yr", brand: "GE", serial: "DD300093K", expect: { status: "ambiguous", includes: [{ year: 2026 }, { year: 2014 }] } },
  // LG / Kenmore
  { label: "LG 603KWWZ73713 → {2026, 2016, 2006}", brand: "LG", serial: "603KWWZ73713", expect: { status: "ambiguous", years: [2026, 2016, 2006] } },
  { label: "LG 909KWAT04496 → includes Sep 2009, no single pick", brand: "LG", model: "WM0642HW/02", serial: "909KWAT04496", expect: { status: "ambiguous", includes: [{ year: 2009, month: 9 }] } },
  { label: "Kenmore 795.7554440 + 405KR12345 → includes May 2004", brand: "Kenmore", model: "795.7554440", serial: "405KR12345", expect: { status: "ambiguous", includes: [{ year: 2004, month: 5 }] } },
  { label: "Kenmore 999.12345 → need Kenmore prefix", brand: "Kenmore", model: "999.12345", serial: "C2312693", expect: { status: "unknown", unknownReason: "kenmore_prefix_needed" } },
  { label: "Haier HA10TG215W → not supported", brand: "Haier", model: "HA10TG215W", serial: "SM554374", expect: { status: "unknown", unknownReason: "unsupported_manufacturer" } },
  { label: "LG serial entered as Samsung → unknown, never a date", brand: "Samsung", serial: "603KWWZ73713", expect: { status: "unknown" } },
];
