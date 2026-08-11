import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const ITEMS: { to: "/diagnose" | "/documents" | "/history"; label: string }[] = [
  { to: "/diagnose", label: "Diagnose" },
  { to: "/documents", label: "Documents" },
  { to: "/history", label: "History" },
];

export function AppNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: "" }, replace: true });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
        <Link to="/diagnose" className="flex items-center gap-2">
          <BrandLogo size={28} />
          <span className="text-sm font-bold tracking-tight">NextStep</span>
        </Link>
        <nav className="flex items-center gap-1">
          {ITEMS.map((it) => {
            const active = pathname === it.to || pathname.startsWith(it.to + "/");
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {it.label}
              </Link>
            );
          })}
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
              aria-label="Account"
            >
              <User className="h-4 w-4" />
            </button>
            {open && (
              <div
                className="absolute right-0 top-10 z-40 w-56 rounded-xl border border-border bg-popover p-2 text-sm shadow-lg"
                onMouseLeave={() => setOpen(false)}
              >
                <div className="truncate px-3 py-2 text-xs text-muted-foreground">{email ?? "Account"}</div>
                <button
                  onClick={signOut}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}