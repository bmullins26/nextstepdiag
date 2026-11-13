
- Whirlpool-family factory warranty comes from ServiceBench (src/lib/warranty/servicebench.server.ts), 3s cap, best-effort; local warranty rules stay the fallback. Consumer PII from it is never returned.
- Model parts diagrams resolve saved-first from public.model_parts_catalogs (src/lib/parts/catalog-service.server.ts), then V&V, then PartSelect via Firecrawl; any outside result is saved permanently so later lookups stay internal. Parts not on the model list are dropped.
- Partner perks (free Pro periods) are granted only by `claimPartnerPerk` in src/lib/partners, recorded once per user in `partner_perk_claims`, and never overwrite paid or grandfathered Pro — keeps perks auditable and non-stackable.
- Free diagnostic usage is consumed once per saved session through `consume_diagnostic`; all later steps reuse that session, while unrelated AI lookups keep their separate quota — prevents multi-step calls from draining the monthly diagnostic allowance.
- Partner perk students are reviewed by owners in partner_perk_claims.verification_status; rejecting ends only perk-plan Pro (matched by plan_type), never paid Pro.
