// Supplier deep links for a part number. Pure — keeps supplier list in one place.
export const PART_SUPPLIERS = [
  { id: "repairclinic", label: "RepairClinic", url: (q: string) => `https://www.repairclinic.com/Shop-For-Parts?query=${encodeURIComponent(q)}` },
  { id: "marcone", label: "Marcone", url: (q: string) => `https://www.marcone.com/search?q=${encodeURIComponent(q)}` },
  { id: "encompass", label: "Encompass", url: (q: string) => `https://encompass.com/search?searchTerm=${encodeURIComponent(q)}` },
  { id: "searspd", label: "Sears PartsDirect", url: (q: string) => `https://www.searspartsdirect.com/search?q=${encodeURIComponent(q)}` },
] as const;
