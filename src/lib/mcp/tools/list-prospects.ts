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
  name: "list_prospects",
  title: "List prospects",
  description:
    "List prospects (leads) for the signed-in user's tenant. Optionally filter by stage or search term. Returns up to 50 records with the most recent activity.",
  inputSchema: {
    search: z
      .string()
      .trim()
      .optional()
      .describe("Search string matched against name, phone, email, or company."),
    stage: z.string().trim().optional().describe("Filter by pipeline stage id."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum number of results (1-50, default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, stage, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("orbit_prospects")
      .select(
        "id, nome_razao, telefone, email, documento, empresa_id, pipeline_stage_id, temperatura, valor_estimado, created_at, updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(limit ?? 20);

    if (stage) query = query.eq("pipeline_stage_id", stage);
    if (search) {
      const term = `%${search}%`;
      query = query.or(
        `nome_razao.ilike.${term},telefone.ilike.${term},email.ilike.${term},documento.ilike.${term}`
      );
    }

    const { data, error } = await query;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { prospects: data ?? [] },
    };
  },
});
