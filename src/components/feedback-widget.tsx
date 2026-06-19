import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { submitFeedback } from "@/lib/feedback.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Kind = "bug" | "feature" | "general";

export function FeedbackWidget() {
  const submit = useServerFn(submitFeedback);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("general");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setKind("general");
    setSubject("");
    setBody("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      const context = [
        "",
        "---",
        `Page: ${pathname}${search ?? ""}`,
        `UA: ${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}`,
        `Viewport: ${typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "n/a"}`,
      ].join("\n");
      await submit({
        data: {
          kind,
          subject: subject.trim().slice(0, 200),
          body: (body.trim() + context).slice(0, 5000),
        },
      });
      toast.success("Thanks — we got it");
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="fixed bottom-4 right-4 z-40 gap-2 rounded-full shadow-lg md:bottom-6 md:right-6"
          aria-label="Send feedback"
        >
          <MessageSquare className="h-4 w-4" />
          Feedback
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Report a bug or share an idea. We'll include the page URL and your browser info to help reproduce.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fb-kind">Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                <SelectTrigger id="fb-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug report</SelectItem>
                  <SelectItem value="feature">Feature idea</SelectItem>
                  <SelectItem value="general">General feedback</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fb-subject">Subject</Label>
              <Input
                id="fb-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                placeholder="Short summary"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fb-body">Message</Label>
              <Textarea
                id="fb-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={5000}
                rows={6}
                placeholder="What happened? What did you expect? Steps to reproduce…"
                required
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !subject.trim() || !body.trim()}>
              {submitting ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}