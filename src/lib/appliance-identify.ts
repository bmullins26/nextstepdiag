/**
 * Fail-soft wrapper for the AI appliance identification. If the AI call
 * throws, the age result must still be returned; appliance type is left
 * blank for the technician to fill in.
 */
export type Identification = { identified: boolean; manufacturer: string; applianceType: string; platform: string; notes: string };

export async function safeIdentify(
  fn: () => Promise<Identification>,
  fallbackBrand: string,
): Promise<{ id: Identification; failed: boolean }> {
  try {
    return { id: await fn(), failed: false };
  } catch (e) {
    console.warn("[decode] appliance identification failed — continuing without type:", e);
    return {
      id: { identified: false, manufacturer: fallbackBrand, applianceType: "", platform: "", notes: "Appliance type couldn't be identified automatically — pick it below." },
      failed: true,
    };
  }
}
