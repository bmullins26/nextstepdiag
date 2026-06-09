export type ApplianceBrand = {
  name: string;
  ocrSupported: boolean;
  decodeSupported: boolean;
};

// Curated list inspired by HomeSpy's supported brand index.
// decodeSupported=true => we have a rules-based serial decoder.
// ocrSupported=true   => camera button is enabled (green) for tag photo auto-fill.
export const APPLIANCE_BRANDS: ApplianceBrand[] = [
  { name: "Admiral",           ocrSupported: true,  decodeSupported: true  },
  { name: "Alliance Laundry",  ocrSupported: false, decodeSupported: true  },
  { name: "Amana",             ocrSupported: true,  decodeSupported: true  },
  { name: "Asko",              ocrSupported: false, decodeSupported: false },
  { name: "A.O. Smith",        ocrSupported: false, decodeSupported: false },
  { name: "Bosch",             ocrSupported: true,  decodeSupported: true  },
  { name: "Bravos",            ocrSupported: true,  decodeSupported: true  },
  { name: "Cabrio",            ocrSupported: true,  decodeSupported: true  },
  { name: "Cafe",              ocrSupported: true,  decodeSupported: true  },
  { name: "Caloric",           ocrSupported: false, decodeSupported: true  },
  { name: "Crosley",           ocrSupported: true,  decodeSupported: true  },
  { name: "Dacor",             ocrSupported: false, decodeSupported: false },
  { name: "Danby",             ocrSupported: false, decodeSupported: false },
  { name: "Electrolux",        ocrSupported: true,  decodeSupported: true  },
  { name: "Estate",            ocrSupported: true,  decodeSupported: true  },
  { name: "Fisher & Paykel",   ocrSupported: false, decodeSupported: false },
  { name: "Frigidaire",        ocrSupported: true,  decodeSupported: true  },
  { name: "GE (General Electric)", ocrSupported: true,  decodeSupported: true  },
  { name: "Gaggenau",          ocrSupported: false, decodeSupported: true  },
  { name: "Gibson",            ocrSupported: false, decodeSupported: true  },
  { name: "Haier",             ocrSupported: false, decodeSupported: true  },
  { name: "Hisense",           ocrSupported: false, decodeSupported: false },
  { name: "Hotpoint",          ocrSupported: true,  decodeSupported: true  },
  { name: "Inglis",            ocrSupported: true,  decodeSupported: true  },
  { name: "Jenn-Air",          ocrSupported: true,  decodeSupported: true  },
  { name: "Kelvinator",        ocrSupported: false, decodeSupported: true  },
  { name: "Kenmore / Sears",   ocrSupported: true,  decodeSupported: true  },
  { name: "KitchenAid",        ocrSupported: true,  decodeSupported: true  },
  { name: "LG",                ocrSupported: true,  decodeSupported: true  },
  { name: "Magic Chef",        ocrSupported: true,  decodeSupported: true  },
  { name: "Maytag",            ocrSupported: true,  decodeSupported: true  },
  { name: "Neptune",           ocrSupported: true,  decodeSupported: true  },
  { name: "Norcold",           ocrSupported: false, decodeSupported: false },
  { name: "Norge",             ocrSupported: false, decodeSupported: true  },
  { name: "RCA",               ocrSupported: false, decodeSupported: false },
  { name: "Roper",             ocrSupported: true,  decodeSupported: true  },
  { name: "Samsung",           ocrSupported: true,  decodeSupported: true  },
  { name: "Speed Queen",       ocrSupported: false, decodeSupported: true  },
  { name: "Sub-Zero",          ocrSupported: false, decodeSupported: false },
  { name: "Tappan",            ocrSupported: false, decodeSupported: true  },
  { name: "Thermador",         ocrSupported: false, decodeSupported: true  },
  { name: "Viking",            ocrSupported: false, decodeSupported: false },
  { name: "Westinghouse",      ocrSupported: false, decodeSupported: true  },
  { name: "Whirlpool",         ocrSupported: true,  decodeSupported: true  },
  { name: "White-Westinghouse",ocrSupported: false, decodeSupported: true  },
  { name: "Wolf",              ocrSupported: false, decodeSupported: false },
  { name: "Other",             ocrSupported: false, decodeSupported: false },
];

export function findBrand(name: string): ApplianceBrand | undefined {
  const n = name.trim().toLowerCase();
  return APPLIANCE_BRANDS.find((b) => b.name.toLowerCase() === n);
}