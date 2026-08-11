import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Download, Copy, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { listOwnerEmails, searchRecipients } from "@/lib/owner-outreach.functions";
import {
  EmailComposeDialog,
  type ComposeTarget,
} from "@/components/owner/email-compose-dialog";

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
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Emails
        </h2>
      </div>
      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="exports">Exports</TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="mt-4">
          <ComposeTab />
        </TabsContent>
        <TabsContent value="sent" className="mt-4">
          <SentTab />
        </TabsContent>
        <TabsContent value="exports" className="mt-4">
          <ExportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ComposeTab() {
  const searchFn = useServerFn(searchRecipients);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<ComposeTarget>(null);
  const [manual, setManual] = useState("");

  const { data: results, isFetching } = useQuery({
    queryKey: ["owner", "recipient-search", query],
    queryFn: () => searchFn({ data: { query } }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Send a one-to-one message to a user or beta applicant. Search below, or type any address.
      </p>

      <div className="flex flex-wrap gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search users and applicants…"
          className="max-w-xs"
        />
        <div className="flex gap-2">
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Or type an address…"
            className="w-[240px]"
          />
          <Button
            variant="outline"
            disabled={!/\S+@\S+\.\S+/.test(manual.trim())}
            onClick={() => setTarget({ email: manual.trim() })}
          >
            <Mail className="mr-1.5 h-4 w-4" /> Compose
          </Button>
        </div>
      </div>

      <div className="max-h-[420px] overflow-auto rounded-xl border border-border/60 bg-card/60 backdrop-blur">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card/95 text-left text-xs uppercase text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(results ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  {isFetching ? "Searching…" : "No matches."}
                </td>
              </tr>
            ) : (
              (results ?? []).map((r) => (
                <tr key={r.email} className="border-t border-border/50">
                  <td className="px-3 py-2">{r.email}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs uppercase text-muted-foreground">{r.source}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setTarget(r)}>
                      <Mail className="mr-1.5 h-4 w-4" /> Email
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <EmailComposeDialog
        target={target}
        allowEditRecipient
        onOpenChange={(o) => !o && setTarget(null)}
      />
    </div>
  );
}

function SentTab() {
  const fn = useServerFn(listOwnerEmails);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["owner", "sent-emails"],
    queryFn: () => fn(),
  });

  const badge = (status: string) => {
    const tone =
      status === "sent"
        ? "bg-emerald-500/15 text-emerald-500"
        : status === "pending"
          ? "bg-muted text-muted-foreground"
          : status === "suppressed"
            ? "bg-amber-500/15 text-amber-500"
            : "bg-destructive/15 text-destructive";
    return (
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Messages sent from the owner console.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          Refresh
        </Button>
      </div>
      <div className="max-h-[520px] overflow-auto rounded-xl border border-border/60 bg-card/60 backdrop-blur">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card/95 text-left text-xs uppercase text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-3 py-2">Recipient</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Sent</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  {isLoading ? "Loading…" : "Nothing sent yet."}
                </td>
              </tr>
            ) : (
              (data ?? []).map((r) => (
                <tr key={r.messageId} className="border-t border-border/50 align-top">
                  <td className="px-3 py-2">{r.recipient}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.subject ?? "—"}
                    {r.errorMessage ? (
                      <div className="text-xs text-destructive">{r.errorMessage}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{badge(r.status)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
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

function ExportsTab() {
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
