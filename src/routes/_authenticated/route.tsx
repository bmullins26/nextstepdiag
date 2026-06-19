import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { BrandLogo } from "@/components/brand-logo";
import { FeedbackWidget } from "@/components/feedback-widget";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar />
      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur md:hidden">
          <SidebarTrigger />
          <BrandLogo variant="pocket" size={32} />
        </header>
        <div className="flex min-h-svh flex-col">
          <div className="flex-1">
            <Outlet />
          </div>
          <footer className="flex items-center justify-center px-4 py-12">
            <BrandLogo
              variant="full"
              width={500}
              height={280}
              className="block h-auto w-auto max-w-full opacity-90"
            />
          </footer>
        </div>
        <FeedbackWidget />
      </SidebarInset>
    </SidebarProvider>
  );
}