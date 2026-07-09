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
  name: "list_deals",
  title: "List deals",
  description:
    "List deals (opportunities) for the signed-in user's tenant. Optionally filter by pipeline stage. Returns up to 50 deals ordered by most recent update.",
  inputSchema: {
    stage: z.string().trim().optional().describe("Filter by pipeline stage id."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (1-50, default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stage, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("orbit_deals")
      .select(
        "id, titulo, valor_estimado, status, pipeline_stage_id, prospect_id, empresa_id, responsavel_id, created_at, updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(limit ?? 20);
    if (stage) query = query.eq("pipeline_stage_id", stage);

    const { data, error } = await query;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { deals: data ?? [] },
    };
  },
});
