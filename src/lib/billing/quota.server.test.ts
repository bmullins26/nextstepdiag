import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  enforceDiagnosticQuota,
  QuotaExceededError,
} from "./quota.server";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: vi.fn() },
}));

const rpcMock = supabaseAdmin.rpc as unknown as ReturnType<typeof vi.fn>;
const sessionId = "8b7e2c0e-47f0-4df4-9420-c21a09d8f0f5";

describe("free diagnostic session quota", () => {
  beforeEach(() => rpcMock.mockReset());

  it("blocks a new diagnostic after 8 full sessions", async () => {
    rpcMock.mockResolvedValue({
      data: { allowed: false, used: 8, limit: 8, pro: false },
      error: null,
    } as never);

    await expect(enforceDiagnosticQuota("user-1", sessionId)).rejects.toEqual(
      expect.objectContaining<Partial<QuotaExceededError>>({
        name: "QuotaExceededError",
        used: 8,
        limit: 8,
      }),
    );
    expect(rpcMock).toHaveBeenCalledWith("consume_diagnostic", {
      _user_id: "user-1",
      _session_id: sessionId,
    });
  });

  it("allows follow-up steps without increasing the count of 8", async () => {
    rpcMock.mockResolvedValue({
      data: { allowed: true, used: 8, limit: 8, pro: false },
      error: null,
    } as never);

    await expect(enforceDiagnosticQuota("user-1", sessionId)).resolves.toEqual({
      allowed: true,
      used: 8,
      limit: 8,
      pro: false,
    });
  });

  it("does not turn an invalid session into free access", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "diagnostic_session_not_found" },
    } as never);

    await expect(enforceDiagnosticQuota("user-1", sessionId)).rejects.toThrow(
      "The diagnostic session could not be verified. Please start again.",
    );
  });
});
