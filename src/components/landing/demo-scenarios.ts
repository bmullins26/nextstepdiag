// Structured scenario data for the landing-page diagnostic simulation.
// Kept as data (not markup) so new scenarios can be added without touching UI.
export type DemoStep = { title: string; working: string; result: string; tag?: string };
export type DemoScenario = {
  id: string;
  label: string;
  complaint: string;
  steps: DemoStep[];
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "fridge",
    label: "Fridge",
    complaint: "Samsung French door — fresh food warm, freezer fine.",
    steps: [
      { title: "Model & serial decode", working: "Decoding serial date code…", result: "RF28R7351SR · Built Mar 2021 · Mexico", tag: "VERIFIED" },
      { title: "Warranty intelligence", working: "Checking coverage windows…", result: "Out of 1-yr parts · Sealed system covered to 2026", tag: "COVERAGE" },
      { title: "Bulletin & recall scan", working: "Scanning service bulletins…", result: "Known evaporator icing pattern on this series", tag: "TSB" },
      { title: "Grounded diagnosis", working: "Matching confirmed repairs…", result: "Evap fan motor / defrost failure · 84% match", tag: "142 REPAIRS" },
      { title: "Test sequence", working: "Building test order…", result: "Check evap coil frost → fan motor 12 VDC at harness", tag: "STEP-BY-STEP" },
      { title: "Part lookup", working: "Cross-referencing OEM part…", result: "DA97-12540G evaporator fan assembly", tag: "OEM" },
      { title: "Customer summary", working: "Writing plain-English summary…", result: "Ready to text the homeowner", tag: "DONE" },
    ],
  },
  {
    id: "washer",
    label: "Washer",
    complaint: "Whirlpool top load — fills and agitates, won't spin.",
    steps: [
      { title: "Model & serial decode", working: "Decoding serial date code…", result: "WTW5000DW1 · Built Aug 2018 · Clyde, OH", tag: "VERIFIED" },
      { title: "Warranty intelligence", working: "Checking coverage windows…", result: "Out of factory warranty · 7.2 yrs old", tag: "COVERAGE" },
      { title: "Bulletin & recall scan", working: "Scanning service bulletins…", result: "No open recalls · lid lock wear is common", tag: "CLEAR" },
      { title: "Grounded diagnosis", working: "Matching confirmed repairs…", result: "Lid lock assembly · 71% · shifter 18%", tag: "96 REPAIRS" },
      { title: "Test sequence", working: "Building test order…", result: "Run diag mode → check lid lock status & error F5E2", tag: "STEP-BY-STEP" },
      { title: "Part lookup", working: "Cross-referencing OEM part…", result: "W11307249 lid lock assembly", tag: "OEM" },
      { title: "Customer summary", working: "Writing plain-English summary…", result: "Ready to text the homeowner", tag: "DONE" },
    ],
  },
  {
    id: "dryer",
    label: "Dryer",
    complaint: "Maytag electric dryer — tumbles, no heat.",
    steps: [
      { title: "Model & serial decode", working: "Decoding serial date code…", result: "MED6230HW · Built Jan 2020 · Marion, OH", tag: "VERIFIED" },
      { title: "Warranty intelligence", working: "Checking coverage windows…", result: "Out of 1-yr parts · check 10-yr limited parts", tag: "COVERAGE" },
      { title: "Bulletin & recall scan", working: "Scanning service bulletins…", result: "No open recalls · check venting first", tag: "CLEAR" },
      { title: "Grounded diagnosis", working: "Matching confirmed repairs…", result: "Thermal fuse · 58% · heating element 27%", tag: "211 REPAIRS" },
      { title: "Test sequence", working: "Building test order…", result: "Unplug → thermal fuse continuity → element ~10 Ω", tag: "STEP-BY-STEP" },
      { title: "Part lookup", working: "Cross-referencing OEM part…", result: "WP3392519 thermal fuse", tag: "OEM" },
      { title: "Customer summary", working: "Writing plain-English summary…", result: "Ready to text the homeowner", tag: "DONE" },
    ],
  },
  {
    id: "dishwasher",
    label: "Dishwasher",
    complaint: "GE dishwasher — water left in tub after cycle.",
    steps: [
      { title: "Model & serial decode", working: "Decoding serial date code…", result: "GDT665SSNSS · Built 2022 · Louisville, KY", tag: "VERIFIED" },
      { title: "Warranty intelligence", working: "Checking coverage windows…", result: "Past 1-yr parts & labor", tag: "COVERAGE" },
      { title: "Bulletin & recall scan", working: "Scanning service bulletins…", result: "No open recalls", tag: "CLEAR" },
      { title: "Grounded diagnosis", working: "Matching confirmed repairs…", result: "Clogged filter / drain hose · 62% · pump 24%", tag: "88 REPAIRS" },
      { title: "Test sequence", working: "Building test order…", result: "Clean filter → check air gap/hose → pump ~13 Ω", tag: "STEP-BY-STEP" },
      { title: "Part lookup", working: "Cross-referencing OEM part…", result: "WD26X25156 drain pump", tag: "OEM" },
      { title: "Customer summary", working: "Writing plain-English summary…", result: "Ready to text the homeowner", tag: "DONE" },
    ],
  },
];
