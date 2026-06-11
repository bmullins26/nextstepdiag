I found your account is correctly marked as `owner` in the backend, but your screenshot is from the published domain (`nextstepdiag.lovable.app`), which may still be running the older frontend. I’ll make the dashboard more foolproof so owner access can’t fail silently.

Plan:

1. Keep owner role as the source of truth
   - Continue using the backend `user_roles` owner role check.
   - No separate PIN/password flow.

2. Make `/dashboard` wait for owner status
   - Add a visible loading state while the owner check is running.
   - Prevent the page from immediately looking like a regular free-tier technician dashboard before the owner role response returns.

3. Add owner error visibility
   - If the owner check fails, show a small dashboard warning instead of hiding the Owner Dashboard with no explanation.
   - This helps distinguish “not owner” from “role check failed.”

4. Place Owner Dashboard first
   - Owner users will see the Owner Dashboard section directly under the welcome header, before Start Diagnosis, Document Assistant, and Error Code Lookup.

5. Verify deployment expectation
   - After implementation, the preview should show the owner panels once you’re logged in.
   - Since your screenshot is on the published domain, the frontend must be updated/published for the same change to appear at `nextstepdiag.lovable.app`.