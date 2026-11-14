import { createFileRoute, redirect } from "@tanstack/react-router";
// Canonical pricing lives on the home page; keep /pricing as a real URL.
export const Route = createFileRoute("/pricing")({
  beforeLoad: () => { throw redirect({ to: "/", hash: "pricing", statusCode: 301 }); },
});
