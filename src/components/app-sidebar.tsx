import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Stethoscope,
  AlertTriangle,
  FileText,
  History as HistoryIcon,
  LogOut,
  Shield,
  MessagesSquare,
  MessageCircle,
  CreditCard,
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
import { UsageMeter } from "@/components/paywall/usage-meter";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/diagnose", label: "Diagnose", icon: Stethoscope },
  { to: "/error-codes", label: "Error Codes", icon: AlertTriangle },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/community", label: "Community", icon: MessagesSquare },
  { to: "/tech-talk", label: "Tech Talk", icon: MessageCircle },
  { to: "/history", label: "History", icon: HistoryIcon },
] as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED" &&
        event !== "INITIAL_SESSION"
      )
        return;
      setEmail(session?.user?.email ?? null);
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const { data: ownerRow } = useQuery({
    queryKey: ["user-role", "owner", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!)
        .eq("role", "owner")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const isOwner = !!ownerRow;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: "" }, replace: true });
  }

  const isActive = (to: string) =>
    pathname === to || pathname.startsWith(to + "/");

  const items = isOwner
    ? [...NAV, { to: "/owner", label: "Owner", icon: Shield } as const]
    : NAV;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        {collapsed ? (
          <Link
            to="/dashboard"
            aria-label="NextStep Diagnostics"
            className="flex items-center justify-center py-3"
          >
            <BrandLogo variant="pocket" size={60} />
          </Link>
        ) : (
          <Link
            to="/dashboard"
            aria-label="NextStep Diagnostics — A technician in your pocket"
            className="flex w-full items-center justify-center px-1 py-3"
          >
            <BrandLogo variant="full" width={220} height={86} className="max-w-full" />
          </Link>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
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
          {!collapsed && (
            <SidebarMenuItem>
              <div className="px-2 py-1.5">
                <UsageMeter />
              </div>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Billing">
              <Link to="/dashboard" className="flex items-center gap-3">
                <CreditCard className="h-4 w-4 shrink-0" />
                <span>Billing</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
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