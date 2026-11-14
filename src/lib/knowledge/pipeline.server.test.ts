import { describe, expect, test } from "bun:test";
import { AI_MAX_AUTHORITY, buildFactInsert, clampAuthorityForOrigin } from "./pipeline.server";
import { SOURCE_AUTHORITIES, type KnowledgeOrigin } from "./types";

const AI_ORIGINS: KnowledgeOrigin[] = ["ai_extraction", "ai_inference"];

describe("knowledge AI review state", () => {
  test("every requested authority is clamped for every AI origin", () => {
    for (const origin of AI_ORIGINS) {
      for (const requested of SOURCE_AUTHORITIES) {
        const expected = origin === "ai_inference" ? "ai_inference" : AI_MAX_AUTHORITY;
        expect(clampAuthorityForOrigin(origin, requested)).toBe(expected);
      }
    }
  });

  test("every built AI fact row requires review regardless of authority or confidence", () => {
    for (const origin of AI_ORIGINS) {
      for (const requested of SOURCE_AUTHORITIES) {
        const row = buildFactInsert({
          text: "Component: Drive motor\nTest: Measure winding resistance",
          fact: {
            component: "Drive motor",
            test: "Measure winding resistance",
            confidence_score: 0.99,
            confidence_reason: "The source states the component and test explicitly.",
          },
          sourceId: "source-id",
          extractionId: "extraction-id",
          jobId: "job-id",
          brand: "Maytag",
          manufacturer: "Whirlpool",
          applianceType: "washer",
          modelNumber: "MTW6205RW1",
          modelFamily: "MTW6205R",
          sourceAuthority: clampAuthorityForOrigin(origin, requested),
          origin,
          originActor: "test-model",
          pageNumber: 1,
          section: "Motor tests",
        });

        expect(row.needs_review).toBe(true);
        expect(row.review_status).toBe("unreviewed");
      }
    }
  });
});
