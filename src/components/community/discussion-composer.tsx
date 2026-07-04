import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APPLIANCE_BRANDS } from "@/lib/appliance-brands";
import { DISCUSSION_TYPES, DISCUSSION_TYPE_LABEL, type DiscussionType } from "@/lib/community/normalize";
import { createDiscussion } from "@/lib/community.functions";
import { ModelPicker } from "./model-picker";

const APPLIANCE_TYPES = [
  "Refrigerator",
  "Top-Load Washer",
  "Front-Load Washer",
  "Electric Dryer",
  "Gas Dryer",
  "Dishwasher",
  "Range",
  "Wall Oven",
  "Microwave",
  "Ice Maker",
  "Freezer",
  "Cooktop",
  "Other",
];

type Prefill = {
  brand?: string;
  applianceType?: string;
  model?: string;
  complaint?: string;
  confirmedFailure?: string;
  errorCode?: string;
  discussionType?: DiscussionType;
  title?: string;
  body?: string;
  verifiedOutcomeId?: string;
};

export function DiscussionComposer({ prefill }: { prefill?: Prefill }) {
  const navigate = useNavigate();
  const create = useServerFn(createDiscussion);

  const [brand, setBrand] = useState(prefill?.brand ?? "");
  const [applianceType, setApplianceType] = useState(prefill?.applianceType ?? "");
  const [model, setModel] = useState(prefill?.model ?? "");
  const [confirmedNewModel, setConfirmedNewModel] = useState(false);
  const [complaint, setComplaint] = useState(prefill?.complaint ?? "");
  const [errorCode, setErrorCode] = useState(prefill?.errorCode ?? "");
  const [confirmedFailure, setConfirmedFailure] = useState(prefill?.confirmedFailure ?? "");
  const [discussionType, setDiscussionType] = useState<DiscussionType>(prefill?.discussionType ?? "general");
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [body, setBody] = useState(prefill?.body ?? "");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  const requiredMet = brand.trim() && applianceType.trim() && model.trim().length >= 3 && complaint.trim().length >= 3 && title.trim().length >= 3;

  async function submit() {
    if (!requiredMet) {
      toast.error("Brand, Appliance Type, Model, Complaint, and Title are all required.");
      return;
    }
    setBusy(true);
    try {
      const r = await create({
        data: {
          brand,
          applianceType,
          model,
          complaint,
          errorCode: errorCode || null,
          confirmedFailure: confirmedFailure || null,
          discussionType,
          title,
          body,
          verifiedOutcomeId: prefill?.verifiedOutcomeId ?? null,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
      toast.success("Discussion posted.");
      navigate({ to: "/community/$discussionId", params: { discussionId: r.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Brand *</Label>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="mt-1 h-11">
              <SelectValue placeholder="Select brand" />
            </SelectTrigger>
            <SelectContent>
              {APPLIANCE_BRANDS.map((b) => (
                <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Appliance Type *</Label>
          <Select value={applianceType} onValueChange={setApplianceType}>
            <SelectTrigger className="mt-1 h-11">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {APPLIANCE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Model Number *</Label>
        <div className="mt-1">
          <ModelPicker
            brand={brand}
            applianceType={applianceType}
            value={model}
            onChange={setModel}
            confirmed={confirmedNewModel}
            onConfirmedChange={setConfirmedNewModel}
          />
        </div>
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Complaint *</Label>
        <Textarea
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          placeholder="What is the customer reporting?"
          className="mt-1 min-h-20"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Error Code (optional)</Label>
          <Input value={errorCode} onChange={(e) => setErrorCode(e.target.value)} className="mt-1 h-11" placeholder="e.g. F5E2" />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Confirmed Failure (optional)</Label>
          <Input value={confirmedFailure} onChange={(e) => setConfirmedFailure(e.target.value)} className="mt-1 h-11" placeholder="e.g. Drain pump motor" />
        </div>
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Discussion Type *</Label>
        <Select value={discussionType} onValueChange={(v) => setDiscussionType(v as DiscussionType)}>
          <SelectTrigger className="mt-1 h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DISCUSSION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{DISCUSSION_TYPE_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Title *</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-11" placeholder="Short summary" />
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Details</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What did you find? What did you try? Which parts fixed it?"
          className="mt-1 min-h-32"
        />
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tags (comma separated)</Label>
        <Input value={tags} onChange={(e) => setTags(e.target.value)} className="mt-1 h-11" placeholder="drain-pump, lid-lock" />
      </div>

      <Button
        onClick={submit}
        className="h-12 w-full"
        disabled={busy || !requiredMet}
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Post discussion
      </Button>
    </div>
  );
}