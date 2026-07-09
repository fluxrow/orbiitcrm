import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProspects from "./tools/list-prospects";
import getProspect from "./tools/get-prospect";
import listDeals from "./tools/list-deals";
import listTasks from "./tools/list-tasks";
import createTask from "./tools/create-task";

// The OAuth issuer MUST be the direct Supabase host, not the Lovable Cloud proxy.
// Build it from the project ref so the value survives publish and stays
// import-safe (no runtime env reads at module top level).
const projectRef =
  (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "orbit-crm-mcp",
  title: "Orbit CRM",
  version: "0.1.0",
  instructions:
    "Tools for the Orbit CRM. Read and manage prospects (leads), deals, and tasks for the signed-in user's tenant. All operations are scoped by RLS to the user's empresa (tenant).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProspects, getProspect, listDeals, listTasks, createTask],
});
