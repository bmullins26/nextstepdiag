import { createFileRoute, redirect } from "@tanstack/react-router";
// Account settings live on the dashboard (sign-in enforced there).
export const Route = createFileRoute("/account")({
  beforeLoad: () => { throw redirect({ to: "/dashboard" }); },
});
