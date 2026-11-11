// Brands built/serviced by Whirlpool Corporation (eligible for ServiceBench lookup).
const WP_BRANDS = ["whirlpool", "maytag", "kitchenaid", "amana", "jennair", "jenn-air", "roper", "estate", "admiral", "inglis", "crosley"];
const KENMORE_WP_PREFIXES = ["110", "106", "665", "596"];

export function isWhirlpoolFamily(brand: string, model: string): boolean {
  const b = brand.toLowerCase().replace(/\s+/g, "");
  if (WP_BRANDS.some((x) => b.includes(x.replace(/\s+/g, "")))) return true;
  if (b.includes("kenmore")) return KENMORE_WP_PREFIXES.some((p) => model.replace(/\D/g, "").startsWith(p) || model.startsWith(p));
  return false;
}
