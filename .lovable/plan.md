# Use Homespy's REST API directly

You're right — homespy exposes a public REST API. The most accurate way to "do exactly what homespy does" is to **call their API**, not re-implement their algorithm. They have years of feedback tuning and partner data we can't replicate.

## The endpoint

```bash
curl -X GET "https://homespy.io/api/decode" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"make":"WHIRLPOOL","serial":"CF2328200","model":"11092573210"}'
```

Returns their decoded age + confidence. Pricing/tokens come from homespy (signup at homespy.io).

## Proposed architecture: homespy-first with local fallback

```text
User submits brand + serial + model
        │
        ▼
┌─────────────────────────────┐
│  Cache hit? (90 days)       │──► return cached
└──────────┬──────────────────┘
           │ miss
           ▼
┌─────────────────────────────┐
│  Homespy API (primary)      │──► success → cache + return
└──────────┬──────────────────┘
           │ fail (no key, 429, 5xx, unsupported brand)
           ▼
┌─────────────────────────────┐
│  Local decoder (fallback)   │──► return with "fallback" badge
└─────────────────────────────┘
```

Why this shape:
- **Homespy = source of truth** when available → matches their accuracy by definition.
- **Local decoder still ships** so the feature works offline, on unsupported brands, or if the homespy bill lapses.
- **Cache** keeps cost down (1 paid call per unique serial+model, 90-day TTL).
- **Same result schema** — UI doesn't care which source answered.

## Changes

1. **New secret**: `HOMESPY_API_TOKEN` (added via `add_secret` once you confirm you have an account).
2. **New server module** `src/lib/age-decoder/homespy.server.ts` — `fetchHomespy({ brand, serial, model })` returning a normalized `DecodeOutcome`.
3. **Rewrite** `src/lib/serial-decode.functions.ts` to: check cache → call homespy → on failure call existing local pipeline.
4. **Cache table**: reuse `age_decode_corroborations` or add a small `age_decode_homespy_cache` (serial+model+brand → response_json, 90d TTL).
5. **UI tag** on result: "Decoded by homespy" vs "Local fallback" (small muted badge).
6. **Cost guardrail**: rate-limit per user (e.g. 50 decodes/day) and surface a clear message when hit.

## What stays / what goes

- **Keep**: local serial rules — they're the fallback and handle unsupported brands.
- **Drop from scope**: the bigger rebuild plan I proposed earlier (multi-source corroboration, feedback weights, brand expansion). Not needed if homespy is the primary.
- **Out of scope**: image recognition / OCR.

## What I need from you

1. **Do you have (or will you create) a homespy.io API account?** Pricing is on their docs — I can't sign up for you. Once you have the token I'll wire it up via `add_secret`.
2. **Fallback behavior when no token / API down** — silently use local decoder (with badge), or show an error and refuse?
3. **Per-user rate limit** — yes (suggest 50/day) or no cap?
