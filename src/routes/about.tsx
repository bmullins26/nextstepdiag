import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/site/info-page";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — NextStep Diagnostics" },
      { name: "description", content: "NextStep Diagnostics is a field diagnostic assistant built by appliance technicians." },
      { property: "og:title", content: "About — NextStep Diagnostics" },
      { property: "og:description", content: "NextStep Diagnostics is a field diagnostic assistant built by appliance technicians." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <InfoPage title="About">
      <p>NextStep Diagnostics is a field tool for appliance technicians: guided one-question-at-a-time diagnosis, serial-number age decoding, warranty and recall checks, and model-specific parts diagrams.</p>
      <p>AI suggestions are always labelled as estimates and kept separate from manufacturer documentation and technician-confirmed repairs.</p>
    </InfoPage>
  ),
});
