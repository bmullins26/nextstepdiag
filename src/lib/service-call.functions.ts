// Service-call pipeline server functions: recall/bulletin scan and closeout
// (ordered test plan, OEM part candidates, homeowner message).
// AI output is Zod-validated and labelled as reference — never authoritative.
import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyDriveTopology, topologyPromptBlock, filterForTopology } from "@/lib/appliance/drive-topology";

const ApplianceRef = z.object({
  brand: z.string().min(1).max(80),
  applianceType: z.string().max(120).default(""),
  modelNumber: z.string().min(1).max(60),
});

export type RecallHit = { title: string; date: string | null; url: string | null; hazard: string | null; source: "cpsc" };
export type KnownIssue = { text: string; source: "knowledge" };

export const scanRecalls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApplianceRef.parse(d))
  .handler(async ({ data, context }) => {
    const recalls: RecallHit[] = [];
    let cpscError: string | null = null;
    // 1) U.S. CPSC public recall API — searched by the full model AND the
    // base model (trim/revision suffix stripped). Zero hits is NOT proof of
    // no recall: CPSC only matches models typed into its ProductModel field.
    const full = data.modelNumber.split("/")[0]!.trim().replace(/\s+/g, "").toUpperCase();
    const base = full.replace(/^([A-Z]+\d+[A-Z]*?)(\d?[A-Z]{0,3}\d?)$/, "$1");
    const queries = Array.from(new Set([full, base.length >= 5 ? base : full, full.slice(0, 7)])).filter((q) => q.length >= 5);
    const seen = new Set<string>();
    let okCount = 0;
    await Promise.all(
      queries.map(async (q) => {
        try {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 9000);
          const url = `https://www.saferproducts.gov/RestWebServices/Recall?format=json&ProductModel=${encodeURIComponent(q.slice(0, 20))}`;
          const res = await fetch(url, { signal: ctl.signal });
          clearTimeout(t);
          if (!res.ok) { cpscError = "unavailable"; return; }
          okCount++;
          const rows = (await res.json()) as Array<Record<string, any>>;
          for (const r of rows.slice(0, 5)) {
            const key = String(r.RecallID ?? r.Title);
            if (seen.has(key)) continue;
            seen.add(key);
            recalls.push({
              title: String(r.Title ?? "Recall"),
              date: r.RecallDate ? String(r.RecallDate).slice(0, 10) : null,
              url: r.URL ? String(r.URL) : null,
              hazard: r.Hazards?.[0]?.Name ? String(r.Hazards[0].Name) : null,
              source: "cpsc",
            });
          }
        } catch {
          cpscError = "unavailable";
        }
      }),
    );
    if (okCount > 0) cpscError = null;
    // 2) Known failure patterns from our own Knowledge Engine for this model / family.
    const prefix = data.modelNumber.replace(/[^A-Za-z0-9]/g, "").slice(0, 6);
    let knownIssues: KnownIssue[] = [];
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const approved = await supabaseAdmin
        .from("knowledge_facts")
        .select("failure, symptom, component, notes")
        .eq("review_status", "approved")
        .is("superseded_by", null)
        .or(`model_number.ilike.${prefix}%,model_family.ilike.${prefix}%`)
        .limit(40);
      if (approved.error) throw new Error(approved.error.message);
      const facts = [...(approved.data ?? [])];
      if (facts.length < 3) {
        const fallback = await supabaseAdmin
          .from("knowledge_facts")
          .select("failure, symptom, component, notes, knowledge_sources!inner(source_type)")
          .eq("review_status", "unreviewed")
          .neq("knowledge_sources.source_type", "external_repair_data")
          .is("superseded_by", null)
          .or(`model_number.ilike.${prefix}%,model_family.ilike.${prefix}%`)
          .limit(40);
        if (fallback.error) throw new Error(fallback.error.message);
        facts.push(...(fallback.data ?? []));
      }
      const counts = new Map<string, number>();
      for (const fact of facts) {
        const key = (fact.failure || fact.component || "").trim();
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      knownIssues = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([key, count]) => ({
          text: `${key}${count > 1 ? ` (${count} records)` : ""}`,
          source: "knowledge" as const,
        }));
    } catch (err) {
      console.warn("[recalls] known-issue lookup failed", err);
    }
    return { recalls, knownIssues, cpscError };
  });

const CloseoutInput = ApplianceRef.extend({
  complaint: z.string().max(2000),
  failures: z.array(z.string().max(300)).max(5),
  history: z.array(z.object({ question: z.string(), answer: z.string() })).max(40).default([]),
  ageYears: z.number().nullable().optional(),
  warrantyHeadline: z.string().max(200).optional(),
});

export const CloseoutSchema = z.object({
  testPlan: z.array(z.object({
    step: z.string().describe("One physical test, short, imperative"),
    expected: z.string().describe("Expected reading/result e.g. '~10 Ω', '120 VAC', 'continuity'"),
  })).max(8),
  parts: z.array(z.object({
    name: z.string(),
    partNumber: z.string().describe("OEM part number if known with confidence, else empty string"),
    confidence: z.enum(["high", "medium", "low"]),
  })).max(4),
  homeownerMessage: z.string().describe("Plain-English SMS to the homeowner, under 600 chars, no jargon, with [PRICE] placeholder"),
});
export type Closeout = z.infer<typeof CloseoutSchema>;

export const generateCloseout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CloseoutInput.parse(d))
  .handler(async ({ data, context }) => {
    const { getGateway, DEFAULT_MODEL } = await import("./ai-gateway.server");
    const { logAiUsage } = await import("./ai-usage-log.server");
    const topo = classifyDriveTopology(data.applianceType, data.modelNumber);
    // Real parts list for this exact model (V&V Appliance Parts). Best-effort.
    const { getGroundedCatalog } = await import("./parts/catalog-service.server");
    const { matchToCatalog } = await import("./parts/vv/parse");
    const vv = await getGroundedCatalog(data.modelNumber, data.brand);
    const catalog = filterForTopology(vv.parts, topo, (p) => p.description);
    const catalogBlock = catalog.length
      ? `PARTS LIST FOR THIS EXACT MODEL (from the model's parts diagrams). You MUST pick parts only from this list and copy the part number exactly. Never suggest a part that is not listed:\n${catalog.slice(0, 160).map((c) => `- ${c.partNumber} | ${c.description} | ${c.diagram}`).join("\n")}`
      : "";
    try {
      const { object, usage } = await generateObject({
        model: getGateway()(DEFAULT_MODEL),
        schema: CloseoutSchema,
        system:
          "You are a senior appliance repair technician. Produce an ordered, safe test plan to confirm the suspected failure, the likely OEM replacement parts, and a friendly homeowner text. Only give an OEM part number if you are confident it fits this exact model; otherwise leave partNumber empty. Always include 'Disconnect power' before electrical resistance tests.",
        prompt: [
          `Appliance: ${data.brand} ${data.applianceType} model ${data.modelNumber}${data.ageYears != null ? `, ~${data.ageYears} yrs old` : ""}`,
          topologyPromptBlock(topo),
          catalogBlock,
          data.warrantyHeadline ? `Warranty: ${data.warrantyHeadline}` : "",
          `Complaint: ${data.complaint}`,
          `Suspected failures (ranked): ${data.failures.join("; ") || "unknown"}`,
          data.history.length ? `Tech Q&A:\n${data.history.map((h) => `- ${h.question} → ${h.answer}`).join("\n")}` : "",
        ].filter(Boolean).join("\n"),
      });
      await logAiUsage({ userId: context.userId, feature: "service_closeout", model: DEFAULT_MODEL, usage });
      // Deterministic guardrail: drop parts/tests for components this machine lacks.
      const closeout = {
        ...object,
        parts: filterForTopology(object.parts, topo, (p) => p.name).flatMap((p) => {
          if (!catalog.length) return [{ ...p, partNumber: "", verified: false, price: null as number | null, url: null as string | null }];
          const hit = matchToCatalog(p.name, p.partNumber, catalog);
          // Not on this model's parts list → drop it rather than show a wrong part.
          if (!hit) return [];
          return [{ name: hit.description || p.name, partNumber: hit.partNumber, confidence: p.confidence, verified: true, price: hit.price, url: hit.url }];
        }).filter((p, i, a) => { const k = (n: string) => n.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^WP/, ""); return !p.partNumber || a.findIndex((x) => k(x.partNumber) === k(p.partNumber)) === i; }),
        testPlan: filterForTopology(object.testPlan, topo, (t) => t.step),
      };
      return { ok: true as const, closeout, partsSource: catalog.length ? { name: vv.provider ?? "Parts diagrams", modelUrl: vv.modelUrl, count: catalog.length, internal: vv.internal } : null };
    } catch (e) {
      console.error("[closeout] failed", e);
      return { ok: false as const, error: "Couldn't build the closeout right now. Try again." };
    }
  });

// Load (or pull once and save) the real parts diagrams for a model, so diagnosis is grounded.
export const preloadPartsCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ brand: z.string().max(80).default(""), modelNumber: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data }) => {
    const { getGroundedCatalog } = await import("./parts/catalog-service.server");
    const c = await getGroundedCatalog(data.modelNumber, data.brand || undefined);
    return { provider: c.provider, internal: c.internal, count: c.parts.length, modelUrl: c.modelUrl, diagrams: c.diagrams.slice(0, 20) };
  });

// Live Whirlpool-family factory entitlement (ServiceBench). Never blocks the call.
export const lookupFactoryWarranty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    brand: z.string().min(1).max(80),
    modelNumber: z.string().min(1).max(60),
    serialNumber: z.string().min(3).max(60),
  }).parse(d))
  .handler(async ({ data }) => {
    const { isWhirlpoolFamily } = await import("@/lib/warranty/whirlpool-family");
    if (!isWhirlpoolFamily(data.brand, data.modelNumber)) return { supported: false as const, entitlement: null };
    const { lookupServiceBench } = await import("@/lib/warranty/servicebench.server");
    const entitlement = await lookupServiceBench(data.modelNumber, data.serialNumber);
    return { supported: true as const, entitlement };
  });
