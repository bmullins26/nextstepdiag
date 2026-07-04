## Goal
Make the sidebar toggle button always visible at the top of every authenticated page (not just on mobile), so users can open the side menu without needing to start a diagnostic first. The sidebar remains collapsed by default.

## Change
Edit `src/routes/_authenticated/route.tsx`:

- Remove the `md:hidden` class from the sticky top header so it renders on all viewport sizes.
- Keep `SidebarTrigger` + small `BrandLogo` inside it so the menu button is always reachable.
- Leave `defaultOpen={false}` on `SidebarProvider` so the sidebar starts closed.
- No changes to `AppSidebar`, routing, or any page content.

## Result
On every authenticated route (Dashboard, Diagnose, Community, etc.), a slim header bar shows the hamburger trigger + logo. Clicking it opens the sidebar; it stays closed until the user opens it.