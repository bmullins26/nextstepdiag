import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwner } from "@/lib/owner-admin.server";

/** Owner-only health check. Never returns or echoes the API key. */
export const jenovaStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { jenovaHealth, getJenovaConfig } = await import("./jenova.server");
    const cfg = getJenovaConfig();
    const health = await jenovaHealth();
    return {
      ...health,
      agentSlug: cfg.agentSlug,
      baseUrl: cfg.baseUrl,
    };
  });

const CompareInput = z.object({
  manufacturer: z.string().min(1),
  applianceType: z.string().min(1),
  modelNumber: z.string().min(1),
  complaint: z.string().min(1),
  findings: z.array(z.string()).default([]),
});

/**
 * Test mode: run the same NextStep evidence through both providers so the
 * owner can compare reasoning quality before enabling Jenova for everyone.
 */
export const jenovaCompare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompareInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { gatherEvidence, provenanceBlock, tieredPromptBlock } = await import(
      "@/lib/evidence/engine"
    );
    const { runDiagnosticStep } = await import("./diagnostic-provider.server");

    let evidence: Awaited<ReturnType<typeof gatherEvidence>> = [];
    try {
      evidence = await gatherEvidence(
        {
          brand: data.manufacturer,
          applianceType: data.applianceType,
          model: data.modelNumber,
          complaint: data.complaint,
          userId: context.userId,
        },
        { supabase: context.supabase },
      );
    } catch (err) {
      console.warn("[jenova-compare] evidence pipeline failed:", err);
    }

    const system = `You are an appliance diagnostic assistant guiding a senior tech on-site. The product question is always: "What should I test next?"
Only cite connectors, pins, voltages, resistances and fault codes that appear in the supplied NextStep evidence. Never present an inference as a verified fact.
The appliance is a ${data.manufacturer} ${data.applianceType} (model ${data.modelNumber}). Never apply another manufacturer's procedures.`;
    const prompt = `MANUFACTURER: ${data.manufacturer}
APPLIANCE: ${data.applianceType}
MODEL: ${data.modelNumber}

Customer Complaint: ${data.complaint}

Already verified by the technician:
${data.findings.length ? data.findings.map((f) => `- ${f}`).join("\n") : "(none)"}

RANKED EVIDENCE (grouped by tier):
${tieredPromptBlock(evidence)}`;
    const provenance = provenanceBlock(evidence);

    const [lovable, jenova] = await Promise.all([
      runDiagnosticStep({
        system,
        prompt,
        provenance,
        userId: context.userId,
        feature: "provider_compare",
        provider: "lovable",
      }).catch((e) => ({ error: e instanceof Error ? e.message : "failed" })),
      runDiagnosticStep({
        system,
        prompt,
        provenance,
        userId: context.userId,
        feature: "provider_compare",
        provider: "jenova",
      }).catch((e) => ({ error: e instanceof Error ? e.message : "failed" })),
    ]);

    return {
      evidenceCount: evidence.length,
      lovable,
      jenova,
    };
  });
