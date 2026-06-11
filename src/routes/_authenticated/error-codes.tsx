import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APPLIANCE_BRANDS } from "@/lib/appliance-brands";
import {
  lookupErrorCode,
  type ErrorCodeRow,
} from "@/lib/error-codes.functions";

export const Route = createFileRoute("/_authenticated/error-codes")({
  head: () => ({
    meta: [
      { title: "Error Codes — NextStep Diagnostics" },
      {
        name: "description",
        content:
          "Look up appliance fault codes by brand. See meaning, common causes, and recommended tests.",
      },
    ],
  }),
  component: ErrorCodesPage,
});

type Result =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; row: ErrorCodeRow }
  | { kind: "missing"; brand: string; code: string };

function ErrorCodesPage() {
  const lookupFn = useServerFn(lookupErrorCode);
  const [brand, setBrand] = useState<string>("Whirlpool");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });

  async function onLookup(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c) {
      toast.error("Enter an error code.");
      return;
    }
    setResult({ kind: "loading" });
    try {
      const r = await lookupFn({ data: { brand, code: c } });
      if (r.notFound) setResult({ kind: "missing", brand, code: c });
      else setResult({ kind: "found", row: r.row });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lookup failed.");
      setResult({ kind: "idle" });
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <header>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
            Reference
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">
            Error Code Lookup
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Pick a brand, enter the fault code displayed on the appliance, and
            get the meaning, common causes, and a recommended test list.
          </p>
        </header>

        <div className="mt-6 grid gap-5 lg:grid-cols-[380px_1fr]">
          <form onSubmit={onLookup} className="glass-card space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="brand">Brand</Label>
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger id="brand" className="h-11">
                  <SelectValue placeholder="Select a brand" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {APPLIANCE_BRANDS.filter((b) => b.name !== "Other").map((b) => (
                    <SelectItem key={b.name} value={b.name}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="code">Error Code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. F7E1, SUD, OE"
                className="h-11 font-mono uppercase tracking-wide"
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground">
                Codes are case-insensitive.
              </p>
            </div>

            <Button
              type="submit"
              className="h-11 w-full font-bold"
              disabled={result.kind === "loading"}
            >
              {result.kind === "loading" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Look up code
            </Button>
          </form>

          <section className="glass-card min-h-[320px] p-5">
            <ResultView state={result} />
          </section>
        </div>
      </div>
    </main>
  );
}

function ResultView({ state }: { state: Result }) {
  if (state.kind === "idle") {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <p className="mt-4 max-w-sm text-sm text-muted-foreground">
          Choose a brand and enter a fault code on the left to see the meaning,
          common causes, and recommended tests.
        </p>
      </div>
    );
  }
  if (state.kind === "loading") {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (state.kind === "missing") {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="mt-3 text-base font-bold">
          No match for {state.brand} · {state.code.toUpperCase()}
        </h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          We don't have this code in the reference yet. Try a related code, or
          open Documents to upload the tech sheet and ask the assistant.
        </p>
      </div>
    );
  }

  const r = state.row;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-primary/15 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-primary">
          {r.brand} · {r.code}
        </span>
      </div>
      <div>
        <h2 className="text-xl font-black leading-snug">{r.meaning}</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-background/40 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-secondary">
            Common Causes
          </div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {(r.common_causes ?? []).map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-primary">
            Recommended Tests
          </div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {(r.recommended_tests ?? []).map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}