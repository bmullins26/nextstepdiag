// Weighted confidence engine. Points are additive and evidence-based.
import type {
  Confidence,
  ConfidenceBreakdown,
  ConfidencePoint,
  Corroboration,
  CrossChecks,
  DateCandidate,
  ModelWindow,
  Rule,
} from "./types";

export const CONFIDENCE_WEIGHTS = {
  matchedFormat: 30,
  modelWindow: 25,
  apiAgreement: 20,
  historicalRule: 15,
  noAmbiguity: 10,
} as const;

export const MAX_CONFIDENCE_POINTS =
  CONFIDENCE_WEIGHTS.matchedFormat +
  CONFIDENCE_WEIGHTS.modelWindow +
  CONFIDENCE_WEIGHTS.apiAgreement +
  CONFIDENCE_WEIGHTS.historicalRule +
  CONFIDENCE_WEIGHTS.noAmbiguity;

export function labelFor(percent: number): Confidence {
  if (percent >= 75) return "High";
  if (percent >= 45) return "Medium";
  return "Low";
}

export function computeConfidence(opts: {
  rule: Rule;
  chosen: DateCandidate;
  candidates: DateCandidate[];
  corroboration: Corroboration | null;
  modelWindow?: ModelWindow | null;
  crossChecks?: CrossChecks | null;
  rejectedCount: number;
}): ConfidenceBreakdown {
  const { rule, chosen, candidates, corroboration, modelWindow, crossChecks } = opts;
  const points: ConfidencePoint[] = [];

  // 1. Matched a known manufacturer format — scaled by the rule's own weight.
  const formatPoints = Math.round(CONFIDENCE_WEIGHTS.matchedFormat * rule.weight);
  points.push({
    label: "Matched manufacturer format",
    points: formatPoints,
    awarded: true,
    detail: rule.name,
  });

  // 2. Model production window agrees.
  const windowAgrees =
    !!modelWindow &&
    (modelWindow.introducedYear == null || chosen.year >= modelWindow.introducedYear) &&
    (modelWindow.discontinuedYear == null || chosen.year <= modelWindow.discontinuedYear + 1);
  points.push({
    label: "Model production window agrees",
    points: windowAgrees ? CONFIDENCE_WEIGHTS.modelWindow : 0,
    awarded: windowAgrees,
    detail: modelWindow
      ? `${modelWindow.modelPrefix}: ${modelWindow.introducedYear ?? "?"}–${modelWindow.discontinuedYear ?? "current"}`
      : "No production window on file for this model",
  });

  // 3. Appliance Age Finder API / technician confirmation agrees.
  const apiYear = crossChecks?.apiYear ?? null;
  const confirmedYear = crossChecks?.confirmedYear ?? null;
  const apiAgrees = apiYear != null && apiYear === chosen.year;
  const confirmedAgrees = confirmedYear != null && confirmedYear === chosen.year;
  const apiConflicts = apiYear != null && apiYear !== chosen.year;
  points.push({
    label: confirmedAgrees ? "Technician-confirmed date" : "External source agrees",
    points: apiAgrees || confirmedAgrees ? CONFIDENCE_WEIGHTS.apiAgreement : 0,
    awarded: apiAgrees || confirmedAgrees,
    detail: apiConflicts
      ? `External lookup returned ${apiYear} instead`
      : apiAgrees
        ? `Appliance Age Finder also returned ${apiYear}`
        : confirmedAgrees
          ? "A technician confirmed this exact date"
          : "No external confirmation available",
  });

  // 4. Web corroboration / historical decodes for the same model family.
  const corroborated =
    !!corroboration?.used && corroboration.hits.some((h) => h.year === chosen.year);
  const historical = (crossChecks?.historicalYears ?? []).includes(chosen.year);
  points.push({
    label: "Corroborating evidence",
    points: corroborated || historical ? CONFIDENCE_WEIGHTS.historicalRule : 0,
    awarded: corroborated || historical,
    detail: corroborated
      ? `${corroboration!.hits.filter((h) => h.year === chosen.year).length} web source(s) mention ${chosen.year}`
      : historical
        ? "Matches previous successful decodes for this model family"
        : "No corroborating source found",
  });

  // 5. No ambiguity — a single surviving candidate, or a clear winner.
  const sorted = candidates.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const clearWinner =
    candidates.length === 1 ||
    (sorted[0] === chosen && (sorted[0].score ?? 0) - (sorted[1]?.score ?? 0) >= 0.3);
  points.push({
    label: "No ambiguity",
    points: clearWinner ? CONFIDENCE_WEIGHTS.noAmbiguity : 0,
    awarded: clearWinner,
    detail:
      candidates.length === 1
        ? "Only one valid date survived validation"
        : clearWinner
          ? `Clear winner among ${candidates.length} candidates`
          : `${candidates.length} candidate years remain plausible`,
  });

  // Ambiguity penalty: each additional surviving year makes the answer weaker.
  if (!clearWinner && candidates.length > 1) {
    const penalty = -Math.min(20, (candidates.length - 1) * 7);
    points.push({
      label: "Ambiguous year cycle",
      points: penalty,
      awarded: true,
      detail: `${candidates.length} plausible years from this serial`,
    });
  }

  // Penalties: external disagreement, and corroboration that found nothing.
  if (apiConflicts && !confirmedAgrees) {
    points.push({
      label: "External source disagrees",
      points: -15,
      awarded: true,
      detail: `Appliance Age Finder returned ${apiYear}`,
    });
  }
  if (corroboration?.used && !corroborated && corroboration.hits.length > 0) {
    points.push({
      label: "Web evidence points elsewhere",
      points: -10,
      awarded: true,
      detail: "Sources were found but none support this year",
    });
  }

  // Community confirmations add a small bounded bonus.
  const confirmations = crossChecks?.communityConfirmations ?? 0;
  if (confirmations > 0) {
    const bonus = Math.min(10, confirmations * 2);
    points.push({
      label: "Community verified",
      points: bonus,
      awarded: true,
      detail: `${confirmations} technician confirmation${confirmations === 1 ? "" : "s"}`,
    });
  }

  // Percent is scored against the evidence that was actually AVAILABLE, so a
  // clean format match with no external sources on file is not punished for
  // evidence that could never have existed. Unavailable categories are excluded
  // from the denominator; available-but-failing categories still cost points.
  const modelWindowAvailable = !!modelWindow;
  const externalAvailable = apiYear != null || confirmedYear != null;
  const corroborationAvailable = !!corroboration?.used && corroboration.hits.length > 0;

  const applicableMax =
    CONFIDENCE_WEIGHTS.matchedFormat +
    CONFIDENCE_WEIGHTS.noAmbiguity +
    (modelWindowAvailable ? CONFIDENCE_WEIGHTS.modelWindow : 0) +
    (externalAvailable ? CONFIDENCE_WEIGHTS.apiAgreement : 0) +
    (corroborationAvailable ? CONFIDENCE_WEIGHTS.historicalRule : 0);

  const earned = points.reduce((a, p) => a + p.points, 0);
  const percent = Math.max(
    0,
    Math.min(100, Math.round((earned / Math.max(1, applicableMax)) * 100)),
  );

  return {
    points,
    earned,
    max: applicableMax,
    percent,
    label: labelFor(percent),
  };
}
