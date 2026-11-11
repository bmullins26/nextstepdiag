
- Whirlpool-family factory warranty comes from ServiceBench (src/lib/warranty/servicebench.server.ts), 3s cap, best-effort; local warranty rules stay the fallback. Consumer PII from it is never returned.
- Likely parts are snapped to the real per-model parts list from V&V Appliance Parts (src/lib/parts/vv), read via Firecrawl because the site is bot-walled; parts not on that list are dropped.
