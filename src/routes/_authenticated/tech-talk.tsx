import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import {
  TECH_TALK_CHANNELS,
  listTechTalk,
  postTechTalk,
  deleteTechTalk,
  type TechTalkMessage,
} from "@/lib/tech-talk.functions";
import { useEntitlements } from "@/hooks/use-entitlements";
import { UpgradeDialog } from "@/components/paywall/upgrade-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/tech-talk")({
  head: () => ({
    meta: [
      { title: "Tech Talk — NextStep Diagnostics" },
      {
        name: "description",
        content: "Pro channel to swap notes with other technicians by appliance type.",
      },
    ],
  }),
  component: TechTalkPage,
});

function TechTalkPage() {
  const { data: ent } = useEntitlements();
  const [channel, setChannel] = useState<string>(TECH_TALK_CHANNELS[0].id);
  const [body, setBody] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const qc = useQueryClient();
  const listFn = useServerFn(listTechTalk);
  const postFn = useServerFn(postTechTalk);
  const delFn = useServerFn(deleteTechTalk);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);

  const isPro = !!ent?.isPro;

  const { data: messages, isLoading } = useQuery<TechTalkMessage[]>({
    queryKey: ["tech-talk", channel],
    queryFn: () => listFn({ data: { channel: channel as any } }) as any,
    enabled: isPro,
    refetchInterval: 8000,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const activeChannel = useMemo(
    () => TECH_TALK_CHANNELS.find((c) => c.id === channel)!,
    [channel],
  );

  async function send() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setBody("");
    try {
      const res = await postFn({ data: { channel: channel as any, body: trimmed } });
      if ("error" in res) throw new Error(res.error);
      await qc.invalidateQueries({ queryKey: ["tech-talk", channel] });
    } catch (e) {
      setBody(trimmed);
      toast.error(e instanceof Error ? e.message : "Failed to send");
    }
  }

  async function remove(id: string) {
    try {
      const res = await delFn({ data: { id } });
      if (!res.ok) throw new Error(res.error ?? "Failed");
      await qc.invalidateQueries({ queryKey: ["tech-talk", channel] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl">Tech Talk</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Real conversations between technicians. Pick a channel by appliance type.
            </p>
          </div>
          {!isPro && (
            <Button size="sm" onClick={() => setUpgradeOpen(true)}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Upgrade to join
            </Button>
          )}
        </header>

        <div className="mt-6 grid gap-4 lg:grid-cols-[220px_1fr]">
          <nav className="rounded-2xl border border-border/60 bg-card/40 p-2">
            <ul className="space-y-1">
              {TECH_TALK_CHANNELS.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setChannel(c.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      c.id === channel
                        ? "bg-primary/15 font-semibold text-primary"
                        : "hover:bg-muted/60"
                    }`}
                  >
                    #{c.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section className="flex min-h-[60vh] flex-col rounded-2xl border border-border/60 bg-card/40">
            <div className="border-b border-border/60 px-4 py-3">
              <h2 className="text-sm font-bold">#{activeChannel.label}</h2>
            </div>

            {!isPro ? (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div className="max-w-md">
                  <Sparkles className="mx-auto h-8 w-8 text-primary" />
                  <h3 className="mt-3 text-lg font-bold">Tech Talk is a Pro feature</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Chat with fellow technicians about tricky repairs, share tips, and
                    build reputation.
                  </p>
                  <Button className="mt-4" onClick={() => setUpgradeOpen(true)}>
                    See upgrade options
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div
                  ref={scrollRef}
                  className="flex-1 space-y-3 overflow-y-auto p-4"
                >
                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : !messages || messages.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                      No messages yet in #{activeChannel.label}. Kick things off.
                    </div>
                  ) : (
                    messages.map((m) => (
                      <article
                        key={m.id}
                        className="rounded-xl border border-border/60 bg-background/40 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                              {(m.author_name ?? "?").slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-semibold">{m.author_name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {new Date(m.created_at).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          {m.user_id === meId && (
                            <button
                              onClick={() => remove(m.id)}
                              className="text-muted-foreground hover:text-destructive"
                              aria-label="Delete message"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm">{m.body}</p>
                      </article>
                    ))
                  )}
                </div>

                <div className="border-t border-border/60 p-3">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      placeholder={`Message #${activeChannel.label}… (⌘/Ctrl + Enter to send)`}
                      rows={2}
                      className="min-h-[52px] flex-1 resize-none"
                    />
                    <Button onClick={send} disabled={!body.trim()}>
                      <Send className="mr-1.5 h-4 w-4" />
                      Send
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        <UpgradeDialog
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          reason="Tech Talk is included with any NextStep Pro plan."
        />
      </div>
    </main>
  );
}