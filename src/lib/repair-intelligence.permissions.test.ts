import { describe, expect, it } from "vitest";
import { assertOwner } from "./owner-admin.server";

function supabaseWithRole(role: string | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: role ? { role } : null, error: null }),
  };
  return { from: () => chain };
}

describe("repair intelligence owner authorization", () => {
  it("rejects a signed-in technician without the owner role", async () => {
    await expect(assertOwner(supabaseWithRole(null), "technician-id")).rejects.toThrow("Forbidden");
  });

  it("allows the platform owner", async () => {
    await expect(assertOwner(supabaseWithRole("owner"), "owner-id")).resolves.toBeUndefined();
  });
});
