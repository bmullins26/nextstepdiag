import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { EvidenceItem, EvidenceQuery } from "../types";
import { tieredPromptBlock } from "../engine";

let approvedHits: any[] = [];
let fallbackHits: any[] = [];
let parentAuthorities: Record<string, string> = {};

const rpcMock = mock(async (_name: string, args: any) => ({
  data: args.include_pending ? fallbackHits : approvedHits,
  error: null,
}));

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: rpcMock,
    from: () => ({
      select: () => ({
        in: async () => ({
          data: Object.entries(parentAuthorities).map(([id, source_authority]) => ({
            id,
            source_authority,
          })),
          error: null,
        }),
      }),
    }),
  },
}));

mock.module("@/lib/knowledge/embeddings.server", () => ({
  embedOne: async () => Array.from({ length: 3072 }, () => 0),
}));

import {
  computeEvidenceThin,
  knowledgeExternalRepairHits,
  knowledgeFallbackProvider,
  knowledgeRepairRecordProvider,
  knowledgeTechLiteratureProvider,
} from "./knowledge";

function hit(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    source_id: "source-1",
    fact_id: crypto.randomUUID(),
    content: "Measure the drive component under load.",
    brand: "Maytag",
    appliance_type: "washer",
    component: "drive",
    error_code: null,
    page_number: 1,
    section: "Drive system",
    source_type: "technician_note",
    source_authority: "ai_extracted_pending_review",
    confidence_score: 0.8,
    needs_review: true,
    review_status: "unreviewed",
    similarity: 0.8,
    score: 0.4,
    ...overrides,
  };
}

let sequence = 0;
function query(): EvidenceQuery {
  sequence += 1;
  return {
    brand: "Maytag",
    applianceType: "washer",
    model: "MTW6205RW1",
    complaint: `No spin test ${sequence}`,
    userId: "user-1",
  };
}

beforeEach(() => {
  approvedHits = [];
  fallbackHits = [];
  parentAuthorities = {};
  rpcMock.mockClear();
});

describe("two-stage knowledge evidence", () => {
  test("an unapproved repair record is never verified_repair", async () => {
    fallbackHits = [hit({ source_type: "repair_record" })];
    const q = query();
    expect(await knowledgeRepairRecordProvider.fetch(q, {} as any)).toEqual([]);
    const fallback = await knowledgeFallbackProvider.fetch(q, {} as any);
    expect(fallback).toHaveLength(1);
    expect(fallback[0]?.sourceType).toBe("fallback_unreviewed");
  });

  test("non-OEM technical literature is tech_sheet, never service_bulletin", async () => {
    approvedHits = [
      hit({
        source_type: "tech_sheet",
        review_status: "approved",
        needs_review: false,
        source_authority: "reviewed_normalized",
      }),
    ];
    parentAuthorities = { "source-1": "ai_extracted_pending_review" };
    const items = await knowledgeTechLiteratureProvider.fetch(query(), {} as any);
    expect(items).toHaveLength(1);
    expect(items[0]?.sourceType).toBe("tech_sheet");
    expect(knowledgeTechLiteratureProvider.sourceType).not.toBe("service_bulletin");
  });

  test("quarantined and rejected rows never appear even if an RPC returns them", async () => {
    approvedHits = [hit({ review_status: "quarantined" }), hit({ review_status: "rejected" })];
    fallbackHits = [hit({ review_status: "quarantined" }), hit({ review_status: "rejected" })];
    expect(await knowledgeFallbackProvider.fetch(query(), {} as any)).toEqual([]);
  });

  test("zero approved hits produces an unreviewed fallback item", async () => {
    fallbackHits = [hit()];
    const items = await knowledgeFallbackProvider.fetch(query(), {} as any);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0]?.confidence).toBeLessThanOrEqual(0.25);
  });

  test("stage-2 unreviewed external_repair_data rows are dropped", async () => {
    fallbackHits = [hit({ source_type: "external_repair_data" })];
    const q = query();
    expect(await knowledgeFallbackProvider.fetch(q, {} as any)).toEqual([]);
    expect(await knowledgeExternalRepairHits(q)).toEqual([]);
  });

  test("evidenceThin follows retrieval score and T1-T3 presence", () => {
    const strong = [{ sourceType: "manufacturer_doc", metadata: {} } as EvidenceItem];
    const weak = [{ sourceType: "fallback_unreviewed", metadata: {} } as EvidenceItem];
    expect(computeEvidenceThin({ stage1Sufficient: false, topScore: 0.44 }, strong)).toBe(true);
    expect(computeEvidenceThin({ stage1Sufficient: false, topScore: 0.45 }, strong)).toBe(false);
    expect(computeEvidenceThin({ stage1Sufficient: true, topScore: 0.9 }, weak)).toBe(true);
  });
});

test("tieredPromptBlock snapshot uses internal T-codes only", () => {
  const items = [
    {
      id: "repair-1",
      sourceType: "verified_repair",
      title: "Drive clutch record",
      summary: "Clutch replacement resolved the no-spin complaint.",
      confidence: 0.8,
      lastUpdated: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "literature-1",
      sourceType: "service_bulletin",
      title: "Drive literature",
      summary: "Measure clutch engagement during spin.",
      confidence: 0.9,
      lastUpdated: "2026-01-01T00:00:00.000Z",
    },
  ] satisfies EvidenceItem[];
  const block = tieredPromptBlock(items);
  expect(block).not.toContain("Verified");
  expect(block).not.toContain("Service Bulletin");
  expect(block).toMatchInlineSnapshot(`
"### T2_LIT
- [conf 90%] Drive literature — Measure clutch engagement during spin.
### T3_REPAIR
- [conf 80%] Drive clutch record — Clutch replacement resolved the no-spin complaint."
`);
});
