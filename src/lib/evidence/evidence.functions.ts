import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gatherEvidence } from "./engine";
import type { EvidenceItem } from "./types";

const Input = z.object({
  brand: z.string().min(1),
  applianceType: z.string().default(""),
  model: z.string().default(""),
  complaint: z.string().default(""),
  errorCode: z.string().nullable().optional(),
  sessionId: z.string().uuid().nullable().optional(),
});

export const gatherEvidenceForSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<EvidenceItem[]> => {
    return gatherEvidence(
      {
        brand: data.brand,
        applianceType: data.applianceType ?? "",
        model: data.model ?? "",
        complaint: data.complaint ?? "",
        errorCode: data.errorCode ?? null,
        sessionId: data.sessionId ?? null,
        userId: context.userId,
      },
      { supabase: context.supabase },
    );
  });