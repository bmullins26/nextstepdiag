import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Download, Copy, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportEmailList, type EmailSegment } from "@/lib/owner-emails.functions";

export const Route = createFileRoute("/_authenticated/owner/emails")({
  head: () => ({
    meta: [
      { title: "Email Exports — Owner Console" },
      {
        name: "description",
        content: "Export segmented recipient lists for product update emails.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmailsPage,
});

const SEGMENTS: { value: EmailSegment; label: string; hint: string }[] = [
  { value: "all_users", label: "All users", hint: "Every registered account" },
  { value: "pro_users", label: "Pro users", hint: "Active Pro subscribers" },
  { value: "free_users", label: "Free users", hint: "No active Pro access" },
  { value: "beta_approved", label: "Beta — approved", hint: "Approved beta applicants" },
  { value: "beta_pending", label: "Beta — pending", hint: "Awaiting review" },
  { value: "beta_all", label: "Beta — all applicants", hint: "Every application on file" },
];

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function EmailsPage() {
  const fn = useServerFn(exportEmailList);
  const [segment, setSegment] = useState<EmailSegment>("all_users");
  const [excludeSuppressed, setExcludeSuppressed] = useState(true);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["owner", "email-export", segment, excludeSuppressed],
    queryFn: () => fn({ data: { segment, excludeSuppressed } }),
  });

  const recipients = data?.recipients ?? [];
  const meta = SEGMENTS.find((s) => s.value === segment);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Email Exports
        </h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Build a recipient list for a product update or announcement, then export it as CSV or copy
        the addresses into your sending tool. Bounced and unsubscribed addresses can be excluded
        automatically.
      </p>

      <div className="grid gap-4 rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur sm:grid-cols-[240px_1fr] sm:items-end">
        <div className="space-y-1.5">
          <Label>Segment</Label>
          <Select value={segment} onValueChange={(v) => setSegment(v as EmailSegment)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEGMENTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {meta ? <p className="text-xs text-muted-foreground">{meta.hint}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="exclude-suppressed"
              checked={excludeSuppressed}
              onCheckedChange={setExcludeSuppressed}
            />
            <Label htmlFor="exclude-suppressed" className="text-sm font-normal">
              Exclude unsubscribed & bounced
            </Label>
          </div>
          <div className="text-sm text-muted-foreground">
            {isLoading || isFetching ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Building list…
              </span>
            ) : (
              <>
                <span className="font-semibold text-foreground">{recipients.length}</span>{" "}
                recipients
                {data?.suppressed ? ` · ${data.suppressed} suppressed removed` : ""}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!recipients.length}
          onClick={() => download(`nextstep-${segment}.csv`, data?.csv ?? "")}
        >
          <Download className="mr-1.5 h-4 w-4" /> Download CSV
        </Button>
        <Button
          variant="outline"
          disabled={!recipients.length}
          onClick={async () => {
            await navigator.clipboard.writeText(recipients.map((r) => r.email).join(", "));
            toast.success(`Copied ${recipients.length} addresses.`);
          }}
        >
          <Copy className="mr-1.5 h-4 w-4" /> Copy addresses
        </Button>
      </div>

      <div className="max-h-[480px] overflow-auto rounded-xl border border-border/60 bg-card/60 backdrop-blur">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card/95 text-left text-xs uppercase text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Segment</th>
            </tr>
          </thead>
          <tbody>
            {recipients.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                  {isLoading ? "Loading…" : "No recipients in this segment."}
                </td>
              </tr>
            ) : (
              recipients.map((r) => (
                <tr key={r.email} className="border-t border-border/50">
                  <td className="px-3 py-2">{r.email}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs uppercase text-muted-foreground">
                    {r.segment}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
