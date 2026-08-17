// Client-safe shared types for the diagnostic AI provider layer.
// NextStep owns the diagnostic state; a provider only supplies reasoning.

export type DiagnosticProviderName = "lovable";

export interface DiagnosticNextQuestion {
  text: string;
  choices: string[];
  allowFreeText: boolean;
}

export interface DiagnosticStepOutput {
  done: boolean;
  currentFindings: string;
  mostLikelyFailure: string;
  mostLikelyFailures: string[];
  recommendedNextTest: string;
  nextQuestion: DiagnosticNextQuestion;
  /** Optional provider reasoning surface. */
  reasoning?: string;
  expectedResult?: string;
  resultInterpretation?: string;
  safetyWarning?: string;
  supportingEvidence?: string[];
  /** 0..1 provider self-reported confidence. Never treated as verification. */
  confidence?: number;
}

export interface DiagnosticProviderResult {
  output: DiagnosticStepOutput;
  provider: DiagnosticProviderName;
  /** Provider actually used may differ from requested when a fallback ran. */
  requestedProvider: DiagnosticProviderName;
  providerError?: string | null;
}
