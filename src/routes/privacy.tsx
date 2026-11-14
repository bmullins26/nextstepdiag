import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/site/info-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — NextStep Diagnostics" },
      { name: "description", content: "How NextStep Diagnostics handles your data." },
      { property: "og:title", content: "Privacy Policy — NextStep Diagnostics" },
      { property: "og:description", content: "How NextStep Diagnostics handles your data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <InfoPage title="Privacy Policy">
      <p>We store your account details and the diagnostic sessions you save so you can return to them. We do not sell your data. Customer names or addresses are not required to use the app — please leave them out of notes.</p>
      <p>Anonymized repair outcomes may be aggregated by model to improve diagnostic guidance. Contact us to request deletion of your account data.</p>
    </InfoPage>
  ),
});
