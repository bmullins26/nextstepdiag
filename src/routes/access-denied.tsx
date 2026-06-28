import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ShieldOff } from "lucide-react";

export const Route = createFileRoute("/access-denied")({
  head: () => ({
    meta: [
      { title: "Access Inactive — NextStep Diagnostics" },
      { name: "description", content: "Your beta access is currently inactive." },
    ],
  }),
  component: AccessDeniedPage,
});

function AccessDeniedPage() {
  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="max-w-md space-y-5 rounded-2xl border border-border bg-card/70 p-8 text-center backdrop-blur">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <ShieldOff className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Beta access inactive</h1>
        <p className="text-sm text-muted-foreground">
          Your beta access is currently inactive. If you believe this is an error,
          please contact NextStep Diagnostics.
        </p>
        <div className="flex flex-col gap-2">
          <Button asChild variant="outline">
            <a href="mailto:nextstepdiag@gmail.com">Contact Support</a>
          </Button>
          <Button onClick={signOut}>Sign out</Button>
          <Link to="/" className="text-xs text-muted-foreground hover:underline">
            Return home
          </Link>
        </div>
      </div>
    </main>
  );
}