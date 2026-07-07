
## Tool Manager — Phase 1 (Foundation)

Builds the master Tool Intelligence foundation. No import, no automatic tool recommendations, no affiliate integration yet — those are later phases. Extensibility is baked into the schema so those phases don't require a redesign.

### 1. Database

New table `public.tools`:

- `id uuid pk`
- `tool_type text not null` — coarse taxonomy (Test Equipment, Hand Tool, Refrigeration, Safety, Consumable, Power Tool, Specialty, Other). Distinct from `category`; drives future kit/recommendation grouping.
- `category text not null` — finer bucket owned by data entry (e.g. "Multimeters", "Wrenches")
- `subcategory text` (nullable)
- `tool_name text not null`
- `quantity integer not null default 1`
- `affiliate_url text`
- `notes text`
- `active boolean not null default true`
- `metadata jsonb not null default '{}'` — forward-compatible slot (Amazon ASIN, required-vs-recommended, image URL, etc.) so future phases don't need `ALTER TABLE`
- `created_at`, `updated_at`, `created_by uuid` (auth.users, `on delete set null`)

Constraints & indexes:
- `unique (lower(tool_name), lower(category))` — dedupes across case variants so a future import upserts on `(tool_name, category)` instead of creating twins
- `idx_tools_tool_type (tool_type)`
- `idx_tools_category (category)`
- `idx_tools_tool_name (tool_name)`
- `idx_tools_active (active)`
- `updated_at` trigger via existing `public.set_updated_at()`

RLS + grants:
- `GRANT SELECT, INSERT, UPDATE, DELETE ON public.tools TO authenticated; GRANT ALL TO service_role;`
- Enable RLS
- SELECT (active only) for any authenticated user — future diagnostic/community pipelines need reads
- INSERT / UPDATE / DELETE / read-inactive restricted to owners via `has_role(auth.uid(), 'owner')`

Reserved (not created this phase, documented in migration comment): `tool_repair_links`, `tool_appliance_type_links`, `tool_reviews`, `tool_ownership`, `tool_videos`.

### 2. Server functions

New `src/lib/tools.functions.ts`, all `requireSupabaseAuth` + owner check inside handler:

- `listTools({ search?, toolType?, category?, status?, page?, pageSize? })` → `{ rows, total, categories, toolTypes }`
- `getTool({ id })`
- `createTool(input)` / `updateTool({ id, patch })` — surfaces unique-constraint violation as a friendly "A tool with this name+category already exists" error
- `duplicateTool({ id })` — copies row, appends " (Copy)" to name to sidestep the unique index
- `setToolActive({ id, active })`
- `deleteTool({ id })`
- `exportTools()` — CSV string for client download
- `getToolsByIds({ ids })` — stable hydrator so future Diagnostics/Community/Repair modules can resolve `ToolRef = { id: string }` without a redesign

Zod-validated inputs; `tool_type` restricted to the enum list above (extensible by editing one constant).

### 3. Owner navigation

- New tab **Tool Manager** in `OwnerPanels`.
- Dedicated routes for depth: `/_authenticated/owner/tools` (list) and `/_authenticated/owner/tools/$toolId` (detail), both mirroring the owner guard in `owner.tsx`.

### 4. Tool Manager screen

`src/routes/_authenticated/owner/tools.tsx` — styled to match `owner-panels.tsx` tables/cards.

Toolbar:
- Debounced search (name / category / notes)
- Tool Type `<Select>` filter
- Category `<Select>` filter (all + distinct existing values)
- Status filter (All / Active / Inactive)
- **Add Tool** → create dialog
- **Import** — disabled button, tooltip + toast: "Tool import will be enabled in the next phase."
- **Export** → CSV download

Table columns: Tool Name (links to detail) · Type (badge) · Category (+ subcategory as muted secondary) · Quantity · Status · Actions (View / Edit / Duplicate / Disable-Enable / Delete with `AlertDialog` confirm).

Pagination: 25 per page, prev/next + total, TanStack Query keyed on `{search, toolType, category, status, page}`.

Create/Edit dialog fields: name, tool_type (enum select), category, subcategory, quantity, affiliate URL (URL validation), notes, active toggle.

**Recent categories helper:**
- Keep last 8 categories the current user typed/selected in `localStorage` (`nextstep.tools.recentCategories`), most-recent first, deduped case-insensitively.
- Category input becomes a combobox: shows a "Recent" group at top, then "All categories" (distinct values from the server), and free-text entry for new ones. Same treatment for `tool_type` is not needed since it's a fixed enum.

### 5. Tool Detail page

`src/routes/_authenticated/owner/tools/$toolId.tsx`

- Header: name · type badge · category/subcategory badges · active badge · Edit / Back
- Details card: Quantity, Affiliate URL (external link), Notes
- **Metadata card** — `<details>` / collapsible, collapsed by default, renders `metadata` JSONB as syntax-highlighted read-only `<pre>` for dev inspection
- Five "Coming Soon" stub cards (real components, empty bodies so later phases only fill them in):
  - Compatible Repairs
  - Compatible Appliance Types
  - Community Reviews
  - Training Videos
  - Technician Ownership

### 6. Diagnostic foundation hooks

- Export `ToolRef = { id: string }` from `src/lib/tools.functions.ts`.
- `getToolsByIds` shipped now so future diagnostic steps can attach tool references without another design pass.
- No diagnostic UI wired yet.

### 7. Out of scope

Spreadsheet/CSV/Excel import execution, Amazon product matching, community reviews content, ownership tracking, training video content, automatic recommendations in Diagnose/Community, Required-vs-Recommended UI (schema slot via `metadata` only).

### Technical notes

- Uses existing shadcn primitives (`Dialog`, `AlertDialog`, `DropdownMenu`, `Select`, `Badge`, `Input`, `Textarea`, `Button`, `Collapsible`) — no new design tokens.
- Owner enforcement in every server-fn handler (defense in depth) in addition to route guard.
- CSV export runs client-side from fetched data — no new server deps.
- Unique index is expression-based (`lower(...)`) so imports can safely upsert on `(tool_name, category)` in the next phase.
- `metadata jsonb` remains the escape hatch for all future non-relational fields.
