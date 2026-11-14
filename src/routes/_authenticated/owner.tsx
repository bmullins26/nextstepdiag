import {
  createFileRoute,
  redirect,
  isRedirect,
  Outlet,
  Link,
} from "@tanstack/react-router";
import { Shield, ArrowLeft } from "lucide-react";
import { amOwner } from "@/lib/owner.functions";

export const Route = createFileRoute("/_authenticated/owner")({
  head: () => ({
    meta: [
      { title: "Owner Console — NextStep Diagnostics" },
      {
        name: "description",
        content:
          "Owner-only console for users, payments, subscriptions, email campaigns and platform analytics.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    try {
      const { isOwner } = await amOwner();
      if (!isOwner) throw redirect({ to: "/dashboard" });
    } catch (e) {
      if (isRedirect(e)) throw e;
      throw redirect({ to: "/dashboard" });
    }
  },
  component: OwnerLayout,
});

const OWNER_NAV = [
  { to: "/owner", label: "Dashboard", exact: true },
  { to: "/owner/payments", label: "Payments & Subscriptions" },
  { to: "/owner/emails", label: "Email Exports" },
  { to: "/owner/tools", label: "Tool Manager" },
  { to: "/owner/knowledge", label: "Knowledge Engine" },
  { to: "/owner/age-windows", label: "Production Windows" },
] as const;

function OwnerLayout() {
  return (
    <main className="min-h-screen bg-background">
      <div className="border-b border-border/70 bg-card/40 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Shield className="h-6 w-6 shrink-0 text-primary" />
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">Owner Console</h1>
                <p className="hidden text-sm text-muted-foreground sm:block">
                  Platform administration: users, revenue, communication and analytics.
                </p>
              </div>
            </div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to app
            </Link>
          </div>

          <nav className="-mx-4 mt-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {OWNER_NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: (item as { exact?: boolean }).exact ?? false }}
                activeProps={{
                  className:
                    "shrink-0 whitespace-nowrap rounded-lg bg-primary/15 px-3 py-1.5 text-sm font-semibold text-primary",
                }}
                inactiveProps={{
                  className:
                    "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <Outlet />
      </div>
    </main>
  );
}
