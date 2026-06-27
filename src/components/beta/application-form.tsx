import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitBetaApplication } from "@/lib/beta-applications.functions";

const BRANDS = [
  "Whirlpool",
  "GE",
  "LG",
  "Samsung",
  "Frigidaire",
  "Bosch",
  "Speed Queen",
  "Other",
] as const;

const ROLES = [
  "Independent Technician",
  "Service Company Technician",
  "Business Owner",
  "Factory Service",
  "Student",
  "Other",
] as const;

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  location: string;
  experienceYears: string;
  role: (typeof ROLES)[number] | "";
  callsPerWeek: string;
  primaryBrands: string[];
  reason: string;
  videoInterview: "yes" | "maybe" | "no" | "";
  feedbackConsent: boolean;
  betaAcknowledged: boolean;
};

const initial: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  company: "",
  location: "",
  experienceYears: "",
  role: "",
  callsPerWeek: "",
  primaryBrands: [],
  reason: "",
  videoInterview: "",
  feedbackConsent: false,
  betaAcknowledged: false,
};

export function BetaApplicationForm() {
  const [s, setS] = useState<FormState>(initial);
  const [submitted, setSubmitted] = useState<null | "ok" | "duplicate">(null);
  const submitFn = useServerFn(submitBetaApplication);

  const mut = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          firstName: s.firstName.trim(),
          lastName: s.lastName.trim(),
          email: s.email.trim(),
          company: s.company.trim(),
          location: s.location.trim(),
          experienceYears: parseInt(s.experienceYears, 10),
          role: s.role as (typeof ROLES)[number],
          callsPerWeek: parseInt(s.callsPerWeek, 10),
          primaryBrands: s.primaryBrands as any,
          reason: s.reason.trim(),
          videoInterview: s.videoInterview || undefined,
          feedbackConsent: true as const,
          betaAcknowledged: true as const,
        } as any,
      }),
    onSuccess: (res) => {
      if (res.ok) {
        setSubmitted("ok");
      } else if (res.reason === "duplicate") {
        setSubmitted("duplicate");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Submission failed"),
  });

  function toggleBrand(b: string) {
    setS((prev) => ({
      ...prev,
      primaryBrands: prev.primaryBrands.includes(b)
        ? prev.primaryBrands.filter((x) => x !== b)
        : [...prev.primaryBrands, b],
    }));
  }

  const canSubmit =
    s.firstName &&
    s.lastName &&
    /.+@.+\..+/.test(s.email) &&
    s.location.length >= 2 &&
    s.experienceYears !== "" &&
    !isNaN(parseInt(s.experienceYears, 10)) &&
    s.role &&
    s.callsPerWeek !== "" &&
    !isNaN(parseInt(s.callsPerWeek, 10)) &&
    s.primaryBrands.length > 0 &&
    s.reason.trim().length >= 20 &&
    s.feedbackConsent &&
    s.betaAcknowledged;

  if (submitted === "ok") {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6 text-center">
        <div className="text-lg font-semibold">Application received 🎉</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Thanks for applying to the NextStep beta. We review applications in waves — if
          selected, you'll get an invitation email with a sign-up link.
        </p>
      </div>
    );
  }

  if (submitted === "duplicate") {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-6 text-center">
        <div className="text-lg font-semibold">You're already on the list</div>
        <p className="mt-2 text-sm text-muted-foreground">
          We already have an application for that email. Hang tight — we'll reach out as
          waves open up.
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        mut.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" required>
          <Input value={s.firstName} onChange={(e) => setS({ ...s, firstName: e.target.value })} />
        </Field>
        <Field label="Last name" required>
          <Input value={s.lastName} onChange={(e) => setS({ ...s, lastName: e.target.value })} />
        </Field>
      </div>
      <Field label="Email" required>
        <Input
          type="email"
          value={s.email}
          onChange={(e) => setS({ ...s, email: e.target.value })}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company (optional)">
          <Input value={s.company} onChange={(e) => setS({ ...s, company: e.target.value })} />
        </Field>
        <Field label="Location (City, State/Country)" required>
          <Input
            value={s.location}
            onChange={(e) => setS({ ...s, location: e.target.value })}
            placeholder="Austin, TX"
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Years of experience" required>
          <Input
            type="number"
            min={0}
            value={s.experienceYears}
            onChange={(e) => setS({ ...s, experienceYears: e.target.value })}
          />
        </Field>
        <Field label="Role" required>
          <Select value={s.role} onValueChange={(v) => setS({ ...s, role: v as any })}>
            <SelectTrigger>
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Service calls per week" required>
          <Input
            type="number"
            min={0}
            value={s.callsPerWeek}
            onChange={(e) => setS({ ...s, callsPerWeek: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Primary brands serviced" required>
        <div className="flex flex-wrap gap-2">
          {BRANDS.map((b) => {
            const on = s.primaryBrands.includes(b);
            return (
              <button
                type="button"
                key={b}
                onClick={() => toggleBrand(b)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  on
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-background/40 text-muted-foreground hover:bg-muted/40"
                }`}
              >
                {b}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Why do you want to join the NextStep beta? (min 20 chars)" required>
        <Textarea
          rows={4}
          value={s.reason}
          onChange={(e) => setS({ ...s, reason: e.target.value })}
          placeholder="Tell us about the kind of jobs you run and what would make a diagnostic tool actually useful in the field."
        />
      </Field>

      <Field label="Would you be willing to participate in a short video interview about your experience with NextStep?">
        <Select
          value={s.videoInterview}
          onValueChange={(v) => setS({ ...s, videoInterview: v as any })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Optional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="maybe">Maybe</SelectItem>
            <SelectItem value="no">No</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div className="space-y-2 rounded-xl border border-border bg-card/60 p-3 text-sm">
        <label className="flex items-start gap-2">
          <Checkbox
            checked={s.feedbackConsent}
            onCheckedChange={(v) => setS({ ...s, feedbackConsent: Boolean(v) })}
          />
          <span>
            I'm willing to submit bug reports and feedback during the beta so NextStep can
            improve.
          </span>
        </label>
        <label className="flex items-start gap-2">
          <Checkbox
            checked={s.betaAcknowledged}
            onCheckedChange={(v) => setS({ ...s, betaAcknowledged: Boolean(v) })}
          />
          <span>
            I understand NextStep is in active beta — features may change, break, or be
            rolled back as the product evolves.
          </span>
        </label>
      </div>

      <Button type="submit" disabled={!canSubmit || mut.isPending} className="w-full">
        {mut.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
          </>
        ) : (
          "Submit application"
        )}
      </Button>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
        {required ? <span className="ml-1 text-primary">*</span> : null}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}