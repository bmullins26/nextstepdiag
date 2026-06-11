import { createFileRoute, redirect, isRedirect } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { amOwner } from "@/lib/owner.functions";
import { OwnerPanels } from "@/components/owner-panels";

export const Route = createFileRoute("/_authenticated/owner")({
  head: () => ({ meta: [{ title: "Owner — NextStep Diagnostics" }] }),
  beforeLoad: async () => {
    try {
      const { isOwner } = await amOwner();
      if (!isOwner) throw redirect({ to: "/dashboard" });
    } catch (e) {
      if (isRedirect(e)) throw e;
      throw redirect({ to: "/dashboard" });
    }
  },
  component: OwnerPage,
});

function OwnerPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Owner Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Visibility into users, AI usage, feedback, and cost.
            </p>
          </div>
        </header>
        <OwnerPanels />
      </div>
    </main>
  );
}