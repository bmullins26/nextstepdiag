import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateMyProfile } from "@/lib/profile.functions";

export function AccountSettingsDialog({
  open,
  onOpenChange,
  email,
  currentDisplayName,
  plan,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  email: string | null;
  currentDisplayName: string | null;
  plan: string | null;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateMyProfile);
  const [name, setName] = useState(currentDisplayName ?? "");

  useEffect(() => {
    if (open) setName(currentDisplayName ?? "");
  }, [open, currentDisplayName]);

  const mut = useMutation({
    mutationFn: (displayName: string | null) => updateFn({ data: { displayName } }),
    onSuccess: () => {
      toast.success("Account updated.");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Account Settings</DialogTitle>
          <DialogDescription>
            Control how you're addressed in the app.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-muted-foreground">Email</Label>
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
              {email ?? "—"}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Dashboard name</Label>
            <Input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How you'd like to be greeted"
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">
              Shown on your dashboard greeting. Leave blank to use your email.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/40 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Subscription
            </div>
            <div className="mt-1 text-sm">
              Current plan: <span className="font-semibold capitalize">{plan ?? "free"}</span>
            </div>
            <Button variant="outline" size="sm" className="mt-2" disabled>
              Manage subscription
            </Button>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Billing integration coming soon.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate(name.trim() || null)}
            disabled={mut.isPending}
          >
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}