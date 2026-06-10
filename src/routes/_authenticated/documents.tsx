import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileText, Loader2, Send, Upload, X } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  analyzeDocument,
  askDocumentFollowUp,
} from "@/lib/document-assistant.functions";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Document Assistant — NextStep Diagnostics" },
      {
        name: "description",
        content:
          "Upload appliance tech sheets and wiring diagrams. Get an AI-powered analysis and decide your next diagnostic step.",
      },
      { property: "og:title", content: "Document Assistant — NextStep Diagnostics" },
      {
        property: "og:description",
        content:
          "Upload appliance tech sheets and wiring diagrams. Get an AI-powered analysis and decide your next diagnostic step.",
      },
    ],
  }),
  component: DocumentsPage,
});

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

type Analysis = {
  documentOverview: string;
  visibleText: string;
  componentsIdentified: string[];
  circuitOperation: string;
  voltagePaths: string[];
  testPoints: { location: string; expectedReading: string }[];
  nextDiagnosticStep: string;
  followUpQuestions: string[];
};

type UploadedFile = {
  fileName: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/jpg" | "image/png";
  dataUrl: string;
  size: number;
};

type ChatMsg = { role: "user" | "assistant"; content: string };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function DocumentsPage() {
  const analyzeFn = useServerFn(analyzeDocument);
  const askFn = useServerFn(askDocumentFollowUp);

  const [file, setFile] = useState<UploadedFile | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const summary = useMemo(() => {
    if (!analysis) return "";
    return [
      `Overview: ${analysis.documentOverview}`,
      `Components: ${analysis.componentsIdentified.join("; ")}`,
      `Circuit: ${analysis.circuitOperation}`,
      `Voltage paths: ${analysis.voltagePaths.join(" | ")}`,
      `Next step: ${analysis.nextDiagnosticStep}`,
    ].join("\n");
  }, [analysis]);

  async function onPick(f: File | null | undefined) {
    if (!f) return;
    if (!ALLOWED.has(f.type)) {
      toast.error("Unsupported file type. Use PDF, JPG, or PNG.");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("File too large. Maximum size is 15 MB.");
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(f);
      const uploaded: UploadedFile = {
        fileName: f.name,
        mimeType: f.type as UploadedFile["mimeType"],
        dataUrl,
        size: f.size,
      };
      setFile(uploaded);
      setAnalysis(null);
      setChat([]);
      setAnalyzing(true);
      const result = (await analyzeFn({ data: uploaded })) as Analysis;
      setAnalysis(result);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to analyze document");
    } finally {
      setAnalyzing(false);
    }
  }

  async function onAsk() {
    const q = question.trim();
    if (!q || !file) return;
    setQuestion("");
    const next: ChatMsg[] = [...chat, { role: "user", content: q }];
    setChat(next);
    setAsking(true);
    try {
      const res = (await askFn({
        data: {
          file,
          analysisSummary: summary,
          history: chat,
          question: q,
        },
      })) as { answer: string };
      setChat([...next, { role: "assistant", content: res.answer }]);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to get answer");
      setChat(chat);
      setQuestion(q);
    } finally {
      setAsking(false);
    }
  }

  function clearFile() {
    setFile(null);
    setAnalysis(null);
    setChat([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <div className="flex items-center gap-2">
            <BrandLogo size={32} />
            <h1 className="text-sm font-semibold tracking-tight">
              Document Assistant
            </h1>
          </div>
          <div className="w-12" />
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-2">
        <section className="flex min-h-[60vh] flex-col rounded-2xl border border-border bg-card/50">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-primary" />
              {file ? file.fileName : "Document Preview"}
            </div>
            {file && (
              <button
                onClick={clearFile}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Remove document"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-1 items-stretch justify-center p-3">
            {!file ? (
              <label
                htmlFor="doc-upload"
                className="flex flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-background/40 p-6 text-center transition-colors hover:border-primary/60 hover:bg-accent/30"
              >
                <Upload className="mb-3 h-8 w-8 text-primary" />
                <p className="text-sm font-medium">
                  Upload a tech sheet or diagram
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF, JPG, or PNG · max 15 MB
                </p>
                <input
                  id="doc-upload"
                  ref={inputRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => onPick(e.target.files?.[0])}
                />
              </label>
            ) : file.mimeType === "application/pdf" ? (
              <object
                data={file.dataUrl}
                type="application/pdf"
                className="h-[70vh] w-full rounded-lg"
              >
                <div className="p-6 text-sm text-muted-foreground">
                  PDF preview unavailable in this browser.
                </div>
              </object>
            ) : (
              <img
                src={file.dataUrl}
                alt={file.fileName}
                className="max-h-[75vh] w-full rounded-lg object-contain"
              />
            )}
          </div>
        </section>

        <section className="flex min-h-[60vh] flex-col gap-3">
          <div className="flex-1 overflow-hidden rounded-2xl border border-border bg-card/50">
            <div className="border-b border-border px-4 py-2.5 text-sm font-medium">
              Analysis
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-4">
              {analyzing ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Analyzing document…
                </div>
              ) : !analysis ? (
                <p className="text-sm text-muted-foreground">
                  Upload a document on the left to generate a structured analysis:
                  overview, visible text, components, circuit operation, voltage
                  paths, test points, next step, and follow-ups.
                </p>
              ) : (
                <AnalysisView
                  a={analysis}
                  onPickQuestion={(q) => setQuestion(q)}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col rounded-2xl border border-border bg-card/50">
            <div className="border-b border-border px-4 py-2.5 text-sm font-medium">
              Follow-Up
            </div>
            <div className="max-h-64 space-y-3 overflow-y-auto p-4">
              {chat.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Ask follow-up questions about the document. The assistant only
                  answers from what's visible on the page.
                </p>
              ) : (
                chat.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "ml-6 rounded-lg bg-primary/15 px-3 py-2 text-sm"
                        : "mr-6 whitespace-pre-wrap rounded-lg bg-accent/50 px-3 py-2 text-sm"
                    }
                  >
                    {m.content}
                  </div>
                ))
              )}
              {asking && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                </div>
              )}
            </div>
            <div className="flex items-end gap-2 border-t border-border p-3">
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={
                  file ? "Ask about this document…" : "Upload a document first"
                }
                disabled={!analysis || asking}
                rows={2}
                className="min-h-[44px] resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onAsk();
                  }
                }}
              />
              <Button
                onClick={onAsk}
                disabled={!analysis || asking || !question.trim()}
                size="icon"
              >
                {asking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
        {title}
      </h3>
      <div className="text-sm text-foreground/90">{children}</div>
    </div>
  );
}

function AnalysisView({
  a,
  onPickQuestion,
}: {
  a: Analysis;
  onPickQuestion: (q: string) => void;
}) {
  return (
    <div>
      <Section title="Document Overview">{a.documentOverview}</Section>
      <Section title="Visible Text">
        <pre className="whitespace-pre-wrap rounded-md bg-background/60 p-2 font-mono text-xs">
          {a.visibleText}
        </pre>
      </Section>
      <Section title="Components Identified">
        {a.componentsIdentified.length === 0 ? (
          <span className="text-muted-foreground">
            Not visible in this document.
          </span>
        ) : (
          <ul className="list-disc space-y-0.5 pl-5">
            {a.componentsIdentified.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Circuit Operation">{a.circuitOperation}</Section>
      <Section title="Voltage Paths">
        {a.voltagePaths.length === 0 ? (
          <span className="text-muted-foreground">
            Not visible in this document.
          </span>
        ) : (
          <ul className="list-disc space-y-0.5 pl-5">
            {a.voltagePaths.map((p, i) => (
              <li key={i} className="font-mono text-xs">
                {p}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Test Points & Expected Readings">
        {a.testPoints.length === 0 ? (
          <span className="text-muted-foreground">
            Not visible in this document.
          </span>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-accent/40">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Location</th>
                  <th className="px-2 py-1.5 text-left font-medium">Expected</th>
                </tr>
              </thead>
              <tbody>
                {a.testPoints.map((t, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1.5 align-top">{t.location}</td>
                    <td className="px-2 py-1.5 align-top font-mono">
                      {t.expectedReading}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section title="Next Diagnostic Step">
        <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm font-medium">
          {a.nextDiagnosticStep}
        </div>
      </Section>
      <Section title="Follow-Up Questions">
        {a.followUpQuestions.length === 0 ? (
          <span className="text-muted-foreground">None.</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {a.followUpQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => onPickQuestion(q)}
                className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs hover:border-primary/60 hover:bg-accent"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}