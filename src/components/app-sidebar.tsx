import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Stethoscope,
  AlertTriangle,
  FileText,
  History as HistoryIcon,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { BrandLogo } from "@/components/brand-logo";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/diagnose", label: "Diagnose", icon: Stethoscope },
  { to: "/error-codes", label: "Error Codes", icon: AlertTriangle },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/history", label: "History", icon: HistoryIcon },
] as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const isActive = (to: string) =>
    pathname === to || pathname.startsWith(to + "/");

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        {collapsed ? (
          <Link
            to="/dashboard"
            aria-label="NextStep Diagnostics"
            className="flex items-center justify-center py-2"
          >
            <BrandLogo size={44} />
          </Link>
        ) : (
          <Link
            to="/dashboard"
            aria-label="NextStep Diagnostics"
            className="flex flex-col items-start gap-2 px-1 py-3"
          >
            <BrandLogo size={56} />
            <div className="min-w-0">
              <div className="truncate text-base font-black leading-tight tracking-tight">
                NextStep Diagnostics
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                A technician in your pocket.
              </p>
            </div>
          </Link>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const active = isActive(item.to);
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className="data-[active=true]:bg-primary/15 data-[active=true]:text-primary"
                    >
                      <Link to={item.to} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={email ?? "Account"}
              className="cursor-default hover:bg-transparent"
            >
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                {(email ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <span className="truncate text-xs">{email ?? "Account"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sign out">
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}