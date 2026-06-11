# Full Logo Footer on All Pages

## Goal

The Full Logo currently appears as a centered footer signature only on the dashboard. Add the same signature to every authenticated page (Diagnose, Error Codes, Documents, History, History detail) and bump the size slightly.

## Approach

Render the footer once in the authenticated layout so it appears on every child page automatically — no per-route edits, no risk of pages drifting out of sync.

### `src/routes/_authenticated/route.tsx`

Wrap `<Outlet />` so it fills available space and append a brand footer beneath it:

```tsx
<SidebarInset className="bg-background">
  <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur md:hidden">
    <SidebarTrigger />
    <BrandLogo variant="pocket" size={32} />
  </header>

  <div className="flex min-h-svh flex-col">
    <div className="flex-1">
      <Outlet />
    </div>
    <footer className="flex items-center justify-center px-4 py-12">
      <BrandLogo
        variant="full"
        width={500}
        height={280}
        className="block h-auto w-auto max-w-full opacity-90"
      />
    </footer>
  </div>
</SidebarInset>
```

`500×280` is ~20% larger than the current dashboard signature (`420×240`). `max-w-full` keeps it safe on mobile; `object-fit: contain` (already in `BrandLogo`) preserves aspect ratio.

### `src/routes/_authenticated/dashboard.tsx`

Remove the existing footer section so the logo doesn't render twice on the dashboard:

```tsx
// delete:
<section className="mt-16 flex flex-col items-center text-center">
  <BrandLogo width={420} height={240} className="max-w-full" />
</section>
```

Also drop the now-unused `BrandLogo` import from this file.

## Out of scope

- Public `/` landing page and `/auth` page — they already have their own hero logo treatments.
- Sidebar branding (covered by prior turn).
- Any color, copy, or layout changes to individual pages.

## Verification

Open Diagnose, Error Codes, Documents, History, and a History detail page — each should end with the centered Full Logo signature, sized noticeably larger than before. Dashboard should still show exactly one footer signature, not two.
