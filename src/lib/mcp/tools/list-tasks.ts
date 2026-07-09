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
  name: "list_tasks",
  title: "List tasks",
  description:
    "List open tasks for the signed-in user's tenant. Filter by status (default: pending). Returns up to 50 tasks ordered by due date.",
  inputSchema: {
    status: z
      .enum(["pending", "in_progress", "completed", "cancelled"])
      .optional()
      .describe("Filter by task status. Default: pending."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (1-50, default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("orbit_tasks")
      .select(
        "id, titulo, descricao, status, prioridade, data_vencimento, prospect_id, deal_id, empresa_id, responsavel_id, created_at, updated_at"
      )
      .eq("status", status ?? "pending")
      .order("data_vencimento", { ascending: true, nullsFirst: false })
      .limit(limit ?? 20);

    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { tasks: data ?? [] },
    };
  },
});
