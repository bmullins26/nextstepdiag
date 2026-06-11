## Goal

Rebuild the app shell and add new pages to match the mockup: collapsible left sidebar with persistent NextStep branding, dark-navy/teal glass aesthetic, redesigned Document Assistant, plus new Dashboard and Error Codes pages — while preserving all existing functionality.

**CRITICAL constraints (per user):**
1. **Diagnose workflow is OFF LIMITS for logic changes.** Only restyle its presentation (Tailwind classes, card wrappers, spacing, layout grouping). No changes to state, refs, handlers, server-fn calls, effects, or conditional rendering that gates existing controls.
2. **Do not delete `src/components/app-nav.tsx`.** Stop importing/using it, but leave the file in the repository until the new sidebar is verified across Desktop Chrome, Desktop Safari, iPhone Safari, and Android Chrome. Removal happens in a later turn after cross-browser verification.

## 1. Global shell — collapsible sidebar

New `src/components/app-sidebar.tsx` built on shadcn `Sidebar` (`collapsible="icon"`):

- Collapsed (~64px): icon-only rail with compact NS pocket mark at top.
- Expanded (~280px): `BrandLogo` + "NextStep Diagnostics" wordmark + "A technician in your pocket." tagline, nav labels, user block (avatar + email), Sign Out.
- Nav items: Dashboard, Diagnose, Error Codes, Documents, History. Account/Settings stay out of nav (per prior decision).
- Desktop: expand on hover via controlled `open` state. Mobile: hamburger `SidebarTrigger` in slim top bar; sidebar slides in as Sheet (shadcn default for mobile).
- Active route highlight via `useRouterState` pathname.

Update `src/routes/_authenticated/route.tsx` layout to:
```
<SidebarProvider> <AppSidebar /> <SidebarInset> <MobileTopBar/> <Outlet/> </SidebarInset> </SidebarProvider>
```
**Remove the `<AppNav/>` import and usage from `route.tsx`.** Do NOT delete `src/components/app-nav.tsx` — file stays in the repo as a fallback until the new sidebar is verified on Desktop Chrome, Desktop Safari, iPhone Safari, and Android Chrome. A follow-up turn will delete it after verification.

## 2. Design tokens

`src/styles.css`: deeper navy background token, `--surface` + `--surface-border` glass tokens, teal glow shadow token, `.glass-card` utility (Tailwind v4 `@utility`). Reuse semantic tokens; no hex literals in components.

## 3. Document Assistant redesign (`_authenticated/documents.tsx`)

Two-column desktop grid `grid-cols-[minmax(280px,30%)_1fr]`, single column mobile.

Left rail: compact Upload card (~140px dropzone, Choose File button, accepted formats — preserves existing Safari-safe `inputRef.click()` + status state machine + drag-drop) and Current Document card (filename, page count, size, status pill, Replace, View opens dataUrl in new tab).

Right workspace:
- `DocumentAnalysisCard`: header + status badge + "Analyzed HH:MM", stat tiles (Safety, Components, Diagnostics, Test Points, Error Codes) from existing analysis JSON, "Next Diagnostic Step" callout, "Key Areas Identified" chips.
- `FollowUpChatCard`: dominant card `min-h-[600px]`, scrollable thread (user right-aligned, AI markdown left), suggested follow-up chips, sticky composer (Textarea + Send), disclaimer.
- Existing `analyzeDocument` / `askDocumentFollowUp` server fns unchanged.

## 4. Diagnose page — PRESENTATION ONLY (`_authenticated/diagnose.tsx`)

Allowed: wrap existing JSX in `<Card>`/glass-card containers, adjust Tailwind classes/spacing/grid, reorder sibling sections for hierarchy, swap bare inputs/buttons for shadcn equivalents only when a 1:1 visual swap with no behavior change.

Forbidden: renaming/removing any state, ref, or handler; changing what/when server fns are called; splitting workflow across files in ways that alter mount order; new conditional rendering that gates existing controls.

Target structure (purely visual grouping of existing sections): appliance verification top → appliance age + complaint row → current findings card `lg:sticky lg:top-4` right column → diagnostic progress + recommended next test + most likely failures stacked main column.

## 5. Error Codes page (NEW)

Route `_authenticated/error-codes.tsx`. Static seed table per prior decision.

Migration `error_codes(id, brand, code, meaning, common_causes jsonb, recommended_tests jsonb, timestamps, unique(brand,code))` with GRANT SELECT to authenticated, ALL to service_role, RLS enabled with select policy `USING (true)`. Seed ~25 common codes via supabase--insert across Whirlpool/GE/Samsung/LG/Bosch.

Server fn `src/lib/error-codes.functions.ts` → `lookupErrorCode({ brand, code })` with `requireSupabaseAuth`; case-insensitive match; returns row or `{ notFound: true }`.

Page: left form (Brand select from `appliance-brands.ts`, code input, Lookup button); right result card (Meaning / Common Causes / Recommended Tests).

## 6. Dashboard page (NEW)

Route `_authenticated/dashboard.tsx`. Update `routes/index.tsx` redirect: signed-in → `/dashboard`. Content: greeting, 3 quick-action cards (Diagnose / Documents / Error Codes), Recent diagnostics list via existing `listSessions`.

## 7. History page restyle

Card grid (model, complaint, date, status badge, favorite star), client-side search filter on existing list, existing actions (Resume / View / Delete / favorite). No new server logic.

## 8. Routing

Add `dashboard.tsx` and `error-codes.tsx`; update `routes/index.tsx` redirect; `routeTree.gen.ts` regenerates automatically.

## 9. Out of scope

- Diagnose behavior/logic, prompts, server fns.
- Auth flow, supabase client files, AI gateway wiring, `analyzeDocument`/`askDocumentFollowUp` internals.
- Account/Settings pages.
- Inline PDF preview.
- AI-generated error code lookups.
- **Deleting `app-nav.tsx`** — explicitly deferred to a post-verification turn.

## Technical notes

- All colors via semantic tokens.
- Mobile `SidebarTrigger` lives in top bar (outside sidebar) so it stays visible.
- Consistent `defaultOpen={false}` SSR/client to avoid hydration mismatch; hover-expand is a controlled-state effect (client-only).
- Migration runs first, then code edits reference the new table.

## Files touched

- New: `src/components/app-sidebar.tsx`, `src/routes/_authenticated/dashboard.tsx`, `src/routes/_authenticated/error-codes.tsx`, `src/lib/error-codes.functions.ts`, error_codes migration + seed.
- Edited (UI only): `src/routes/_authenticated/route.tsx` (swap AppNav → sidebar shell), `src/routes/_authenticated/documents.tsx`, `src/routes/_authenticated/diagnose.tsx` (classes/wrappers only), `src/routes/_authenticated/history.tsx`, `src/routes/index.tsx`, `src/styles.css`.
- **Kept as-is on disk:** `src/components/app-nav.tsx` (no longer imported; pending cross-browser verification of the new sidebar before deletion).
