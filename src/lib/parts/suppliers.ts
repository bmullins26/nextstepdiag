// Supplier deep links for a part number. Pure — keeps supplier list in one place.
export const PART_SUPPLIERS = [
  { id: "repairclinic", label: "RepairClinic", url: (q: string) => `https://www.repairclinic.com/Shop-For-Parts?query=${encodeURIComponent(q)}` },
  { id: "vv", label: "V&V Parts", url: (q: string) => /\s/.test(q) ? `https://www.vvapplianceparts.com/lookup?search=${encodeURIComponent(q.split(/\s/)[0])}` : `https://www.vvapplianceparts.com/parts/${encodeURIComponent(q)}` },
  { id: "encompass", label: "Encompass", url: (q: string) => `https://encompass.com/search?searchTerm=${encodeURIComponent(q)}` },
  { id: "searspd", label: "Sears PartsDirect", url: (q: string) => `https://www.searspartsdirect.com/search?q=${encodeURIComponent(q)}` },
] as const;
