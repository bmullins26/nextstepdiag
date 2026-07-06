import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listDiagnosticSessions from "./tools/list-diagnostic-sessions";
import getDiagnosticSession from "./tools/get-diagnostic-session";
import searchCommunity from "./tools/search-community";

// Build the Supabase OAuth issuer from the project ref so it survives publish
// (SUPABASE_URL gets rewritten to a .lovable.cloud proxy on published builds,
// which mcp-js rejects for RFC 8414 issuer mismatch).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "nextstep-diagnostics-mcp",
  title: "NextStep Diagnostics",
  version: "0.1.0",
  instructions:
    "Tools for NextStep Diagnostics — a field diagnostics assistant for appliance technicians. Use `list_diagnostic_sessions` and `get_diagnostic_session` to read the signed-in technician's diagnostic history, and `search_community_discussions` to look up community knowledge by brand, appliance type, or model.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listDiagnosticSessions, getDiagnosticSession, searchCommunity],
});