import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_prospect",
  title: "Get prospect details",
  description:
    "Get the full detail of a single prospect (lead) by id, including recent conversations and open tasks. Respects tenant isolation.",
  inputSchema: {
    prospect_id: z.string().uuid().describe("Prospect UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ prospect_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    const supabase = supabaseForUser(ctx);

    const [{ data: prospect, error: pErr }, { data: tasks }, { data: deals }] = await Promise.all([
      supabase.from("orbit_prospects").select("*").eq("id", prospect_id).maybeSingle(),
      supabase
        .from("orbit_tasks")
        .select("id, titulo, status, data_vencimento, prioridade")
        .eq("prospect_id", prospect_id)
        .order("data_vencimento", { ascending: true, nullsFirst: false })
        .limit(10),
      supabase
        .from("orbit_deals")
        .select("id, titulo, status, valor_estimado, pipeline_stage_id, updated_at")
        .eq("prospect_id", prospect_id)
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);

    if (pErr)
      return { content: [{ type: "text", text: pErr.message }], isError: true };
    if (!prospect)
      return { content: [{ type: "text", text: "Prospect not found" }], isError: true };

    const payload = { prospect, tasks: tasks ?? [], deals: deals ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
