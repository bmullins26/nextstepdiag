
- Whirlpool-family factory warranty comes from ServiceBench (src/lib/warranty/servicebench.server.ts), 3s cap, best-effort; local warranty rules stay the fallback. Consumer PII from it is never returned.
- Model parts diagrams resolve saved-first from public.model_parts_catalogs (src/lib/parts/catalog-service.server.ts), then V&V, then PartSelect via Firecrawl; any outside result is saved permanently so later lookups stay internal. Parts not on the model list are dropped.
