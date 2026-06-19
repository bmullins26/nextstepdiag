/**
 * Static map of well-known appliance platforms. Used as a deterministic
 * fallback when web-fetched literature for the exact model is unavailable.
 *
 * Architecture summaries are intentionally high-level — no pin numbers,
 * voltages, or connector references (those must come from real grounding).
 */

export type PlatformFamily = {
  brand: string;
  family: string;
  applianceTypes: string[];
  /** Model-number prefixes that identify this platform. Uppercase. */
  prefixes: string[];
  /** Public reference URL (trusted_reference tier). */
  referenceUrl?: string;
  /** Architectural overview — symptoms-and-systems only. */
  summary: string;
};

export const PLATFORM_FAMILIES: PlatformFamily[] = [
  {
    brand: "Whirlpool",
    family: "Whirlpool VMW (Vertical Modular Washer)",
    applianceTypes: ["Top-Load Washer"],
    prefixes: ["WTW", "MVW", "7MWTW", "7MMVW"],
    referenceUrl: "https://appliantology.org/",
    summary:
      "VMW platform top-loaders use a single main control board, a shifter actuator for mode change, a Hall-effect motor sensor, a pressure transducer for water level, and a lid-lock switch interrupting motor start. Common failure modes: shifter actuator (no spin / no agitate), lid lock (will not start), pressure transducer (overfill / no-fill), main control (intermittent everything). Diagnostic flow: confirm lid lock state and any stored fault codes first, then verify shifter actuator operation, then sensor readings.",
  },
  {
    brand: "Whirlpool",
    family: "Whirlpool Direct Drive (Front-Load)",
    applianceTypes: ["Front-Load Washer"],
    prefixes: ["WFW", "MHW", "7MWFW", "7MMHW"],
    referenceUrl: "https://appliantology.org/",
    summary:
      "Direct-drive front-loaders combine a motor control unit (MCU) with a central control unit (CCU) communicating over a serial link. Door lock has a 3-position state, drain pump runs through CCU. Common failure modes: door lock (F5E2-style codes), MCU (no spin, motor faults), CCU (display dead / communication faults), drain pump (long-drain codes). Always read stored codes from the CCU before component swaps.",
  },
  {
    brand: "Whirlpool",
    family: "Whirlpool VM Hybrid",
    applianceTypes: ["Top-Load Washer"],
    prefixes: ["WTW5", "WTW7", "WTW8"],
    referenceUrl: "https://appliantology.org/",
    summary:
      "Hybrid top-load platform with capacitive control panel, dedicated motor controller, and a more elaborate water-level sensor stack. Common failures: console (touch unresponsive), pressure sensor, motor controller. Read fault codes from the user interface diagnostic mode before testing.",
  },
  {
    brand: "GE",
    family: "GE Hydrowave",
    applianceTypes: ["Top-Load Washer"],
    prefixes: ["GTW", "HTW", "WHRE"],
    referenceUrl: "https://applianceblog.com/",
    summary:
      "Hydrowave top-loaders use a brushless DC motor with an integrated inverter, a single main control board, and a mechanical lid switch in earlier models / lid lock in later models. Common failures: inverter board (no spin, no agitate), lid switch / lid lock (will not start), water valve, main control. Run service mode to capture stored codes and motor RPM history.",
  },
  {
    brand: "GE",
    family: "GE Harmony",
    applianceTypes: ["Top-Load Washer"],
    prefixes: ["WPGT", "WSXH", "WBVH"],
    referenceUrl: "https://applianceblog.com/",
    summary:
      "Harmony platform uses an SR drive motor with a dedicated drive board and a master control board. Communication faults between the two boards are a common no-spin cause. Diagnose by isolating which board is reporting the fault before replacement.",
  },
  {
    brand: "GE",
    family: "GE Triton (Dishwasher)",
    applianceTypes: ["Dishwasher"],
    prefixes: ["GLD", "GSD", "PDW"],
    referenceUrl: "https://applianceblog.com/",
    summary:
      "Triton dishwashers use a single control board, a separate motor / pump assembly, a turbidity sensor, and a door latch interlock. Common failures: door latch / interlock (no start), drain pump, heater open (poor dry, long cycles), main control. Always run the service test mode to confirm component activation before replacement.",
  },
  {
    brand: "Samsung",
    family: "Samsung VRT",
    applianceTypes: ["Front-Load Washer", "Top-Load Washer"],
    prefixes: ["WF", "WA"],
    referenceUrl: "https://appliantology.org/",
    summary:
      "VRT (Vibration Reduction Technology) machines combine a digital inverter motor, dedicated inverter PCB, main PCB, door lock (front-load) or lid lock (top-load), and a pressure sensor. Common failures: shock absorbers / suspension (high-vibration fault), inverter PCB, door lock, drain pump. Read stored codes from the user interface before component testing.",
  },
  {
    brand: "LG",
    family: "LG Direct Drive",
    applianceTypes: ["Front-Load Washer", "Top-Load Washer"],
    prefixes: ["WM", "WT"],
    referenceUrl: "https://appliantology.org/",
    summary:
      "Direct-drive machines mount the rotor directly on the tub shaft with no belt. A single main PCB controls the inverter motor, door lock, drain pump, and water valve. Common failures: bearings (loud spin), hall sensor (motor faults), door lock, drain pump, main PCB. Read stored codes via diagnostic mode before testing.",
  },
  {
    brand: "Frigidaire",
    family: "Frigidaire Affinity",
    applianceTypes: ["Front-Load Washer", "Electric Dryer", "Gas Dryer"],
    prefixes: ["ATF", "AEQ", "FAFW", "AFW"],
    referenceUrl: "https://applianceblog.com/",
    summary:
      "Affinity platform uses a main control board and a motor control board on the washer; the dryer uses a single main board plus a moisture sensor pair. Common washer failures: door lock, drain pump, motor control board, bearings. Common dryer failures: thermal limiter (no heat), moisture sensor, igniter (gas), main control. Always pull stored codes before component swaps.",
  },
  {
    brand: "Bosch",
    family: "Bosch 500 Series",
    applianceTypes: ["Dishwasher"],
    prefixes: ["SHE", "SHP", "SHX", "SHV"],
    referenceUrl: "https://appliantology.org/",
    summary:
      "500-series dishwashers use a single main control with integrated motor drive, a turbidity sensor, an aquastop solenoid in the inlet hose, and a flow-through heater. Common failures: aquastop (no water, E15 / leak code), heater pump (poor wash), main control, drain pump. Check the leak-detection float in the base pan before assuming a component failure.",
  },
  {
    brand: "Bosch",
    family: "Bosch 800 Series",
    applianceTypes: ["Dishwasher"],
    prefixes: ["SHX8", "SHP8", "SHE8", "SHV8"],
    referenceUrl: "https://appliantology.org/",
    summary:
      "800-series dishwashers add CrystalDry zeolite drying, MyWay third rack, and a more capable main control with extended diagnostics. Same core architecture as 500-series: aquastop, flow-through heater, integrated drive. Use the on-board diagnostic mode to capture stored codes before swapping parts.",
  },
];

function normalize(s: string): string {
  return s.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export function matchPlatformFamily(
  brand: string,
  modelNumber: string,
): PlatformFamily | null {
  const b = brand.trim().toLowerCase();
  const m = normalize(modelNumber);
  if (!b || !m) return null;
  for (const fam of PLATFORM_FAMILIES) {
    if (!fam.brand.toLowerCase().startsWith(b) && !b.startsWith(fam.brand.toLowerCase())) continue;
    for (const prefix of fam.prefixes) {
      if (m.startsWith(normalize(prefix))) return fam;
    }
  }
  return null;
}

// -----------------------------------------------------------------
// Manufacturer-family fallback (brand + appliance type)
// -----------------------------------------------------------------

export type ManufacturerFamily = {
  brand: string;
  applianceType: string;
  displayLabel: string;
  summary: string;
};

export const MANUFACTURER_FAMILIES: ManufacturerFamily[] = [
  {
    brand: "Whirlpool",
    applianceType: "Top-Load Washer",
    displayLabel: "Whirlpool Laundry Platform Knowledge",
    summary:
      "Whirlpool top-load washers across platforms share: single main control board, lid lock / lid switch interlock, water-level sensing (pressure switch or transducer), and motor drive driven by either a belt-and-pulley or direct-drive shifter system. Common failure clusters by symptom — no start: lid lock / door switch / control power; no fill: water valve / pressure sensor; no spin: shifter actuator / motor control / lid lock; leaking: tub seal / pump seal / hose connections.",
  },
  {
    brand: "Whirlpool",
    applianceType: "Front-Load Washer",
    displayLabel: "Whirlpool Front-Load Architecture",
    summary:
      "Whirlpool front-load washers use a Central Control Unit (CCU) plus a Motor Control Unit (MCU). The door lock is a 3-position safety device that must be locked before any cycle. Drain pump, water valves, and detergent dispenser are CCU-controlled. Common symptom clusters — door lock errors: door lock assembly / wiring; motor faults: MCU / motor / tach; long-drain or no-drain: drain pump / clogged trap.",
  },
  {
    brand: "Whirlpool",
    applianceType: "Dishwasher",
    displayLabel: "Whirlpool Dishwasher Architecture",
    summary:
      "Whirlpool dishwashers use a single main control, a wash motor, a separate drain pump, a heating element (or pump-mounted heater on newer models), an optical water sensor (OWI), and a door latch interlock. Common failure clusters — no start: door latch / control; no wash: wash motor / control / OWI; no drain: drain pump / clog; no heat / poor dry: heater open / vent.",
  },
  {
    brand: "GE",
    applianceType: "Dishwasher",
    displayLabel: "GE Dishwasher Service Architecture",
    summary:
      "GE dishwashers use a single control board, a separate wash motor and drain pump (or a combo motor on some models), a heater, a turbidity sensor, and a door latch interlock with a switch reporting to the control. Common failure clusters — no start: door latch / control / membrane; no wash: wash motor / control; no drain: drain pump / clog; no heat: heater open / thermistor; intermittent operation: control board / wiring harness.",
  },
  {
    brand: "GE",
    applianceType: "Top-Load Washer",
    displayLabel: "GE Top-Load Washer Architecture",
    summary:
      "GE top-load washers across Hydrowave, Harmony, and SmartDispense platforms share: main control board, lid switch or lid lock, water valve assembly, water-level sensor, and a motor drive system. Common failure clusters — no start: lid lock / control / power; no spin: motor drive / lid lock / shifter; leaks: tub seal / pump / hoses; long fill: water valve / pressure sensor.",
  },
  {
    brand: "Samsung",
    applianceType: "Front-Load Washer",
    displayLabel: "Samsung Front-Load Washer Architecture",
    summary:
      "Samsung front-load washers use a digital inverter motor with a dedicated inverter PCB, a main PCB, a door lock, drain pump, and pressure sensor for water level. Common failure clusters — door errors: door lock / wiring; vibration faults: shock absorbers / suspension / load balance; drainage faults: drain pump / filter / hose; heating issues: heater / thermistor.",
  },
  {
    brand: "Samsung",
    applianceType: "Refrigerator",
    displayLabel: "Samsung Refrigerator Architecture",
    summary:
      "Samsung refrigerators are dual-evaporator on most full-size models with a main PCB, a separate inverter board for the compressor, evaporator fans for each compartment, and a defrost system per evaporator. Common failure clusters — fresh-food warming: fresh-food evap fan / damper / icing on coil; freezer warming: defrost system / inverter / compressor; ice issues: icemaker assembly / water valve / line freeze.",
  },
  {
    brand: "LG",
    applianceType: "Refrigerator",
    displayLabel: "LG Refrigerator Architecture",
    summary:
      "LG refrigerators use a linear or BLDC inverter compressor with a dedicated inverter PCB, a main PCB, evaporator and condenser fans, and a defrost system. Common failure clusters — no cool: compressor / inverter / sealed system; warming fresh food: damper / evap fan / defrost; ice/water dispenser: dispenser switch / motor / water valve.",
  },
  {
    brand: "LG",
    applianceType: "Front-Load Washer",
    displayLabel: "LG Front-Load Washer Architecture",
    summary:
      "LG front-load washers use a direct-drive motor with rotor on the tub shaft. Single main PCB controls the inverter, door lock, drain pump, water valves, and dispenser. Common failure clusters — bearings: loud spin / wobble; door errors: door lock / harness; drainage: drain pump / filter; no spin: hall sensor / motor / main PCB.",
  },
  {
    brand: "Bosch",
    applianceType: "Dishwasher",
    displayLabel: "Bosch Dishwasher Architecture",
    summary:
      "Bosch dishwashers use a single main control with integrated motor drive, an aquastop inlet hose, a flow-through heater integrated into the circulation pump, and a turbidity sensor. Leak-detection float in the base triggers E15. Common failure clusters — E15 / no fill: leak in base / aquastop / float; no heat: heater pump / thermistor; poor wash: spray arm blockage / heater pump; no drain: drain pump.",
  },
  {
    brand: "Frigidaire",
    applianceType: "Front-Load Washer",
    displayLabel: "Frigidaire Front-Load Washer Architecture",
    summary:
      "Frigidaire front-load washers use a main control board and a motor control board, door lock, drain pump, and a pressure sensor for water level. Common failure clusters — door errors: door lock / wiring; no spin: motor control / bearings / door lock; drainage: drain pump / clog; long fill: water valve / pressure sensor.",
  },
];

export function matchManufacturerFamily(
  brand: string,
  applianceType: string,
): ManufacturerFamily | null {
  if (!brand || !applianceType) return null;
  const b = brand.trim().toLowerCase();
  const t = applianceType.trim().toLowerCase();
  // Exact match first
  for (const fam of MANUFACTURER_FAMILIES) {
    if (fam.brand.toLowerCase() === b && fam.applianceType.toLowerCase() === t) return fam;
  }
  // Loose match — appliance type contains family type keyword
  for (const fam of MANUFACTURER_FAMILIES) {
    if (
      fam.brand.toLowerCase() === b &&
      (t.includes(fam.applianceType.toLowerCase()) ||
        fam.applianceType.toLowerCase().includes(t.split(" ").pop() ?? ""))
    )
      return fam;
  }
  return null;
}