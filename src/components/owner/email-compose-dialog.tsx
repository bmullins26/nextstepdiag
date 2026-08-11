import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sendOwnerEmail } from "@/lib/owner-outreach.functions";

export type ComposeTarget = { email: string; name?: string | null } | null;

export function EmailComposeDialog({
  target,
  onOpenChange,
  allowEditRecipient = false,
  defaultSubject = "",
  defaultMessage = "",
}: {
  target: ComposeTarget;
  onOpenChange: (open: boolean) => void;
  allowEditRecipient?: boolean;
  defaultSubject?: string;
  defaultMessage?: string;
}) {
  const qc = useQueryClient();
  const send = useServerFn(sendOwnerEmail);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [replyTo, setReplyTo] = useState("");

  useEffect(() => {
    if (target) {
      setTo(target.email ?? "");
      setSubject(defaultSubject);
      setMessage(defaultMessage);
    }
  }, [target, defaultSubject, defaultMessage]);

  const mut = useMutation({
    mutationFn: () =>
      send({
        data: {
          to: to.trim(),
          recipientName: target?.name ?? null,
          subject: subject.trim(),
          message: message.trim(),
          replyTo: replyTo.trim() ? replyTo.trim() : null,
        },
      }),
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message);
      else toast.warning(res.message);
      qc.invalidateQueries({ queryKey: ["owner", "sent-emails"] });
      onOpenChange(false);
      setSubject("");
      setMessage("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const valid = /\S+@\S+\.\S+/.test(to.trim()) && subject.trim().length > 0 && message.trim().length > 0;

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>
            Sends one message from your NextStep sender address.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="compose-to">To</Label>
            <Input
              id="compose-to"
              value={to}
              readOnly={!allowEditRecipient}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@example.com"
              className={allowEditRecipient ? "" : "bg-muted/50"}
            />
            {target?.name ? (
              <p className="text-xs text-muted-foreground">{target.name}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="compose-subject">Subject</Label>
            <Input
              id="compose-subject"
              value={subject}
              maxLength={150}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Following up on your report"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="compose-body">Message</Label>
            <Textarea
              id="compose-body"
              value={message}
              maxLength={5000}
              rows={9}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your message…"
            />
            <p className="text-right text-xs text-muted-foreground">{message.length}/5000</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="compose-reply">Reply-to address (optional)</Label>
            <Input
              id="compose-reply"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="you@nextstepdiag.com"
            />
            <p className="text-xs text-muted-foreground">
              Shown in the footer so they know where to write back.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
