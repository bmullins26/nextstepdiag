import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/site/info-page";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — NextStep Diagnostics" },
      { name: "description", content: "Get in touch with the NextStep Diagnostics team." },
      { property: "og:title", content: "Contact — NextStep Diagnostics" },
      { property: "og:description", content: "Get in touch with the NextStep Diagnostics team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <InfoPage title="Contact">
      <p>Signed in? Use the Feedback button in the app — it reaches the team directly.</p>
      <p>Otherwise email <a className="text-primary underline" href="mailto:support@nextstepdiag.com">support@nextstepdiag.com</a>.</p>
    </InfoPage>
  ),
});
