import { createFileRoute } from "@tanstack/react-router";
import { OwnerPanels } from "@/components/owner-panels";

export const Route = createFileRoute("/_authenticated/owner/")({
  head: () => ({
    meta: [
      { title: "Owner Dashboard — NextStep Diagnostics" },
      {
        name: "description",
        content: "Platform overview: users, AI usage, feedback, accuracy and beta program.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <OwnerPanels />,
});
