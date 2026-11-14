import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { getGateway, DEFAULT_MODEL } from "./ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAiUsage } from "./ai-usage-log.server";
import { decodeAge } from "./age-decoder";
import * as ageMath from "./age-decoder/age-math";
import type { DecodeOutcome } from "./age-decoder";
import { parsePlateDate } from "./age-decoder/select";
import { normalizeSerial } from "./age-decoder/decode";
import { safeIdentify } from "./appliance-identify";
import { applyTypeOverrideServerSide } from "./appliance-type-overrides.functions";
import { isWhirlpoolFamily } from "./warranty/whirlpool-family";
import { lookupServiceBench } from "./warranty/servicebench.server";
import { reconcileAge } from "./age-verify/reconcile.server";

const DecodeInput = z.object({
  brand: z.string().min(1),
  modelNumber: z.string().min(1),
  serialNumber: z.string().optional().nullable(),
  /** Date printed on the plate (e.g. 2019.03, 03/2019, MFD 2019-03, FD0103). */
  plateDate: z.string().max(40).optional().nullable(),
});

const DECODER_VERSION = "v4-strict-order";

async function logAttempt(opts: {
  supabase: any;
  userId: string;
  decoderVersion: string;
  manufacturer: string;
  applianceType?: string | null;
  modelNumber: string;
  serialNumber: string;
  outcome:
    | {
        status: "ok";
        ruleId: string;
        confidence: string;
        year: number;
        month: number | null;
        confidencePercent?: number;
        rejectedCount?: number;
      }
    | {
        status: "unknown";
        ruleId?: string | null;
        unknownReason: string;
        rejectedCount?: number;
        rejectionReason?: string | null;
      };
}) {
  try {
    await opts.supabase.from("age_decode_attempts").insert({
      user_id: opts.userId,
      decoder_version: opts.decoderVersion,
      manufacturer: opts.manufacturer,
      appliance_type: opts.applianceType ?? null,
      model_number: opts.modelNumber,
      serial_number: opts.serialNumber,
      status: opts.outcome.status,
      confidence: opts.outcome.status === "ok" ? opts.outcome.confidence : null,
      rule_id: opts.outcome.status === "ok" ? opts.outcome.ruleId : opts.outcome.ruleId ?? null,
      manufacture_year: opts.outcome.status === "ok" ? opts.outcome.year : null,
      manufacture_month: opts.outcome.status === "ok" ? opts.outcome.month : null,
      unknown_reason: opts.outcome.status === "unknown" ? opts.outcome.unknownReason : null,
      confidence_percent: opts.outcome.status === "ok" ? opts.outcome.confidencePercent ?? null : null,
      rejected_count: opts.outcome.rejectedCount ?? 0,
      rejection_reason:
        opts.outcome.status === "unknown" ? opts.outcome.rejectionReason ?? null : null,
      format_id: opts.outcome.status === "ok" ? opts.outcome.ruleId : opts.outcome.ruleId ?? null,
    });
  } catch (e) {
    console.warn("[age-finder] failed to log decode attempt:", e);
  }
}

export const decodeAppliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DecodeInput.parse(d))
  .handler(async ({ data, context }) => {
    const rawSerial = (data.serialNumber ?? "").trim();
    const serial = normalizeSerial(rawSerial);
    const hasSerial = serial.length > 0;
    const now = new Date();
    const plate = parsePlateDate(data.plateDate ?? null, now);

    // === Age lookup is OPTIONAL. Never throw out of this block. ===
    let outcome: DecodeOutcome | null = null;
    let factory: { year: number; month: number | null; detail: string; date: string; warrantyStatus: string | null } | null = null;

    if (hasSerial || plate) {
      try {
        const { loadModelWindow, loadPriorReports, recordWindowConfirmation } = await import("./age-decoder/model-windows.server");
        const [modelWindow, prior] = await Promise.all([
          loadModelWindow(context.supabase, data.brand, data.modelNumber),
          hasSerial
            ? loadPriorReports({ supabase: context.supabase, brand: data.brand, model: data.modelNumber, serial })
            : Promise.resolve({ plate: [], receiptBy: null }),
        ]);

        // Whirlpool family: ServiceBench build date (manufacturedDate only).
        // A ship date is an upper bound, never labelled "built". Not saved as ground truth.
        let shippedBy: { year: number; month: number | null } | null = null;
        if (hasSerial && !plate && isWhirlpoolFamily(data.brand, data.modelNumber)) {
          const sb = await lookupServiceBench(data.modelNumber, serial).catch(() => null);
          const m = sb?.manufacturedDate?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (m) {
            factory = {
              year: Number(m[3]), month: Number(m[1]),
              detail: `Built ${sb!.manufacturedDate}${sb!.markedAs ? ` · ${sb!.markedAs}` : ""}`,
              date: sb!.manufacturedDate!, warrantyStatus: sb!.markedAs ?? null,
            };
          }
          const sh = sb?.shippedDate?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (sh) shippedBy = { year: Number(sh[3]), month: Number(sh[1]) };
        }

        outcome = decodeAge({
          brand: data.brand, model: data.modelNumber, serial, now, modelWindow,
          evidence: {
            plateDate: plate,
            priorPlate: prior.plate,
            factory: factory ? { year: factory.year, month: factory.month } : null,
            shippedBy,
            receiptBy: prior.receiptBy,
          },
        });

        // A typed plate date is a confirmation: remember it and grow the window.
        if (plate) {
          if (hasSerial) {
            await context.supabase.from("age_decode_ground_truth").upsert(
              { user_id: context.userId, manufacturer: data.brand, model_number: data.modelNumber, serial_number: serial, known_year: plate.year, known_month: plate.month ?? null, source: "data_plate", notes: "Date printed on plate (entered at lookup)" },
              { onConflict: "user_id,manufacturer,serial_number" },
            ).then(() => null, () => null);
          }
          await recordWindowConfirmation({ brand: data.brand, model: data.modelNumber, year: plate.year });
        }
      } catch (e) {
        console.warn("[age-decoder] decode threw — continuing without age:", e);
        outcome = null;
      }
    }

    // AI only describes the appliance — never dates/ages. Fail-soft.
    const { id: object } = await safeIdentify(async () => {
      const gateway = getGateway();
      const { object, usage } = await generateObject({
        model: gateway(DEFAULT_MODEL),
        schema: z.object({
          identified: z.boolean(),
          manufacturer: z.string(),
          applianceType: z.string().describe("e.g. Top-Load Washer, Side-by-Side Refrigerator."),
          platform: z.string().describe("Manufacturer's platform/family name if known (e.g. VMW, Direct Drive). Empty if unknown."),
          notes: z.string().describe("Configuration notes or clarifying question for the technician."),
        }),
        system: `You are a senior appliance technician describing an appliance from its data plate.

SAFETY RULE: You MUST NOT state, guess, infer, or imply a manufacture year, manufacture date, or appliance age. The age decoder is a separate deterministic system. Never include a year or age in any field. If asked about age, write: "see age decoder result".

Identify the manufacturer (normalize the brand name), appliance type, and platform/family. If you cannot identify the appliance, set identified=false and ask a clarifying question in notes.`,
        prompt: `Brand: ${data.brand}
Model Number: ${data.modelNumber}
Serial Number: ${serial}

Identify the appliance. Do not state any date or age.`,
      });
      await logAiUsage({ userId: context.userId, feature: "decode_appliance", model: DEFAULT_MODEL, usage }).catch(() => null);
      return object;
    }, data.brand);

    if (hasSerial && outcome) {
      await logAttempt({
        supabase: context.supabase,
        userId: context.userId,
        decoderVersion: DECODER_VERSION,
        manufacturer: object.manufacturer || data.brand,
        applianceType: object.applianceType || null,
        modelNumber: data.modelNumber,
        serialNumber: serial,
        outcome:
          outcome.status === "ok"
            ? { status: "ok", ruleId: outcome.appliedRule.id, confidence: outcome.dateSource, year: outcome.manufactureYear, month: outcome.manufactureMonth, rejectedCount: outcome.rejected.length }
            : {
                status: "unknown",
                ruleId: outcome.appliedRule?.id ?? null,
                unknownReason: outcome.status === "ambiguous" ? "ambiguous_year_cycle" : outcome.unknownReason,
                rejectedCount: outcome.rejected.length,
                rejectionReason: outcome.rejected[0]?.reason ?? null,
              },
      });
    }

    const reconciled = outcome ? reconcileAge({ local: outcome, factoryDetail: factory?.detail ?? null }) : null;
    const ageStatus: "ok" | "ambiguous" | "unknown" = reconciled?.status ?? "unknown";

    const manufactureDate = reconciled?.status === "ok" && reconciled.bestYear
      ? (() => {
          const r = ageMath.manufactureRange(reconciled.bestYear, reconciled.bestMonth ?? null, reconciled.bestWeek ?? null);
          return { year: reconciled.bestYear, month: reconciled.bestMonth ?? r.month, week: reconciled.bestWeek, rangeStart: r.start, rangeEnd: r.end };
        })()
      : null;
    const ageYears = manufactureDate ? ageMath.completedYears(manufactureDate.rangeStart, now) : null;
    const ageText = manufactureDate
      ? ageMath.formatAge({ year: manufactureDate.year, month: reconciled?.bestMonth ?? null, week: manufactureDate.week ?? null }, now)
      : null;
    const appliedRule = outcome?.appliedRule ?? null;

    console.log(
      `[age-finder] decoder=${DECODER_VERSION} brand=${data.brand} model=${data.modelNumber} serial=${serial || "(none)"} rule=${appliedRule?.id ?? "none"} status=${outcome?.status ?? "skipped"} source=${reconciled?.dateSource ?? "none"}`,
    );

    const typeOverride = await applyTypeOverrideServerSide(data.brand, data.modelNumber).catch(() => null);
    const finalApplianceType = typeOverride?.applianceType ?? object.applianceType;
    const finalPlatform = typeOverride?.subType || object.platform;
    const typeSource: "decoder" | "user_override" = typeOverride ? "user_override" : "decoder";

    return {
      identified: object.identified,
      manufacturer: object.manufacturer,
      applianceType: finalApplianceType,
      platform: finalPlatform,
      typeSource,
      confidence: outcome?.status === "ok" ? outcome.dateSource : "unknown",
      decodedBreakdown: outcome?.breakdown ?? "",
      notes:
        outcome?.status === "ok"
          ? object.notes
          : (object.notes ||
            (hasSerial
              ? "Age unavailable — diagnostics are not affected. You can continue without it."
              : "Age lookup is optional and does not affect diagnostics.")),
      manufactureDate,
      ageYears,
      ageText,
      ageStatus,
      normalizedSerial: outcome?.normalizedSerial ?? serial,
      reconciled: reconciled ? { bestYear: reconciled.bestYear, bestMonth: reconciled.bestMonth, sources: reconciled.sources } : null,
      factoryRecord: factory ? { date: factory.date, warrantyStatus: factory.warrantyStatus } : null,
      brand: data.brand,
      modelNumber: data.modelNumber,
      serialNumber: serial,
      ruleFamily: appliedRule?.family ?? "Unknown",
      ruleName: appliedRule?.name ?? "No rule matched",
      ruleBreakdown: outcome?.breakdown ?? "",
      unknownReason: outcome?.status === "unknown" ? outcome.unknownReason : null,
      decodeLogic: outcome
        ? {
            status: outcome.status,
            ruleId: outcome.appliedRule?.id ?? null,
            ruleName: outcome.appliedRule?.name ?? null,
            steps: outcome.steps,
            validation: outcome.validation,
            rejected: outcome.rejected,
            attemptedRules: outcome.attemptedRules,
            confidenceBreakdown: null,
            communityConfirmations: 0,
          }
        : null,
      candidates: (outcome?.candidates ?? []).map((c) => ({ year: c.year, month: c.month ?? null, week: c.week ?? null })),
    };
  });
