import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CURRENT_YEAR = new Date().getFullYear();

const SubmitInput = z.object({
  brand: z.string().trim().min(1).max(100),
  modelNumber: z.string().trim().max(100).optional().nullable(),
  serial: z.string().trim().min(1).max(100),
  knownYear: z.number().int().min(1950).max(CURRENT_YEAR + 1),
  knownMonth: z.number().int().min(1).max(12).optional().nullable(),
  source: z.enum(["data_plate", "receipt", "owner_manual", "other"]).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  decoderYear: z.number().int().optional().nullable(),
  decoderConfidence: z.string().max(40).optional().nullable(),
});

export const submitKnownYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("age_decode_ground_truth")
      .upsert(
        {
          user_id: context.userId,
          manufacturer: data.brand,
          model_number: data.modelNumber ?? null,
          serial_number: data.serial,
          known_year: data.knownYear,
          known_month: data.knownMonth ?? null,
          source: data.source ?? null,
          notes: data.notes ?? null,
          decoder_year: data.decoderYear ?? null,
          decoder_confidence: data.decoderConfidence ?? null,
        },
        { onConflict: "user_id,manufacturer,serial_number" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });