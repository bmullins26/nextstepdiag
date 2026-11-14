import { createFileRoute } from "@tanstack/react-router";
import { InfoPage } from "@/components/site/info-page";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — NextStep Diagnostics" },
      { name: "description", content: "Terms for using NextStep Diagnostics." },
      { property: "og:title", content: "Terms of Service — NextStep Diagnostics" },
      { property: "og:description", content: "Terms for using NextStep Diagnostics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <InfoPage title="Terms of Service">
      <p>NextStep Diagnostics provides diagnostic guidance to trained technicians. Suggestions are assistive, not authoritative — always follow manufacturer service documentation and safety procedures, and disconnect power before testing.</p>
      <p>Subscriptions renew until cancelled and can be cancelled anytime from your account. Questions: see the Contact page.</p>
    </InfoPage>
  ),
});
