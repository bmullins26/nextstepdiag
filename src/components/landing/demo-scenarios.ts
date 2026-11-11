// Structured sample data for the landing-page demo. Mirrors the real Diagnose flow:
// data plate → age & warranty → parts diagram → one question at a time → next test → verified parts.
// Sample data only — no backend calls.
export type DemoQuestion = { q: string; choices: string[]; pick: number };
export type DemoPart = { name: string; number: string; price: string };
export type DemoScenario = {
  id: string;
  label: string;
  brand: string;
  type: string;
  model: string;
  serial: string;
  complaint: string;
  built: string;
  age: string;
  warranty: { status: string; good: boolean; source: string };
  drive?: string;
  diagramParts: number;
  questions: DemoQuestion[];
  failures: { name: string; pct: number }[];
  nextTest: string;
  reading: string;
  safety: string;
  parts: DemoPart[];
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "washer", label: "Washer", brand: "Maytag", type: "Top-load washer",
    model: "MTW6205RW1", serial: "CF0104204", complaint: "Fills, hums, won't spin",
    built: "Jan 2026", age: "< 1 yr", warranty: { status: "In warranty", good: true, source: "Whirlpool factory record" },
    drive: "Direct drive · stator/rotor (no belt, no cap, no shifter)", diagramParts: 78,
    questions: [
      { q: "Does the basket turn freely by hand with the lid open?", choices: ["Yes, freely", "Stiff / grinding", "Won't move"], pick: 0 },
      { q: "Any code in service mode?", choices: ["F7E1 (motor)", "F5E2 (lid lock)", "No code"], pick: 0 },
    ],
    failures: [{ name: "Stator winding open", pct: 64 }, { name: "Rotor position sensor", pct: 21 }, { name: "Motor control board", pct: 15 }],
    nextTest: "Unplug → disconnect stator harness → measure each winding pair",
    reading: "Expect ~10–15 Ω each pair. Open = stator.",
    safety: "Unplug before pulling harness.",
    parts: [{ name: "Stator assembly", number: "W10915700", price: "$189" }, { name: "Rotor, magnetic", number: "W10915701", price: "$96" }],
  },
  {
    id: "dryer", label: "Dryer", brand: "Maytag", type: "Electric dryer",
    model: "MED6230HW", serial: "C04512345", complaint: "Tumbles, no heat",
    built: "2020", age: "6 yrs", warranty: { status: "Out of warranty", good: false, source: "Serial decode" },
    diagramParts: 112,
    questions: [
      { q: "Is the vent clear with strong airflow outside?", choices: ["Yes", "Weak / clogged", "Not sure"], pick: 1 },
      { q: "Thermal fuse continuity?", choices: ["Open", "Closed (0 Ω)"], pick: 0 },
    ],
    failures: [{ name: "Thermal fuse (from blocked vent)", pct: 71 }, { name: "Heating element", pct: 18 }, { name: "Cycling thermostat", pct: 11 }],
    nextTest: "Clean vent first, then check element across terminals",
    reading: "Element ~10 Ω. Open = replace element too.",
    safety: "240 V — unplug and verify dead.",
    parts: [{ name: "Thermal fuse", number: "WP3392519", price: "$12" }, { name: "Cycling thermostat", number: "WP3387134", price: "$24" }],
  },
  {
    id: "fridge", label: "Fridge", brand: "Samsung", type: "French door fridge",
    model: "RF28R7351SR", serial: "0B8F4BBN300123", complaint: "Fresh food warm, freezer fine",
    built: "Mar 2021", age: "5 yrs", warranty: { status: "Sealed system may be covered", good: true, source: "Brand warranty rules" },
    diagramParts: 146,
    questions: [
      { q: "Remove rear panel — is the evap coil frosted over?", choices: ["Heavy frost", "Light frost", "Clear"], pick: 0 },
      { q: "Is the evap fan running with door switch held?", choices: ["Running", "Not running", "Noisy"], pick: 0 },
    ],
    failures: [{ name: "Defrost heater / sensor", pct: 58 }, { name: "Evap fan icing", pct: 27 }, { name: "Main PCB", pct: 15 }],
    nextTest: "Force defrost (Fridge + Energy Saver 8 s) → watch for melt",
    reading: "No melt in 10 min → test defrost heater for continuity.",
    safety: "Unplug before removing the evap cover.",
    parts: [{ name: "Defrost heater assembly", number: "DA47-00243K", price: "$38" }, { name: "Defrost sensor", number: "DA32-00006W", price: "$15" }],
  },
];
