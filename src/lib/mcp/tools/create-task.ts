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
  name: "create_task",
  title: "Create task",
  description:
    "Create a new task for the signed-in user's tenant. Optionally link it to a prospect and/or deal.",
  inputSchema: {
    titulo: z.string().trim().min(1).max(200).describe("Task title."),
    descricao: z.string().trim().max(2000).optional().describe("Optional description."),
    data_vencimento: z
      .string()
      .optional()
      .describe("ISO8601 due date (e.g. 2026-01-15T10:00:00Z)."),
    prioridade: z.enum(["baixa", "media", "alta"]).optional().describe("Priority."),
    prospect_id: z.string().uuid().optional().describe("Link to a prospect."),
    deal_id: z.string().uuid().optional().describe("Link to a deal."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    const supabase = supabaseForUser(ctx);

    // Resolve empresa_id from the caller's profile — never trust client input.
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("id", ctx.getUserId())
      .maybeSingle();

    if (profErr)
      return { content: [{ type: "text", text: profErr.message }], isError: true };
    if (!profile?.empresa_id)
      return {
        content: [{ type: "text", text: "User has no empresa_id in profile" }],
        isError: true,
      };

    const { data, error } = await supabase
      .from("orbit_tasks")
      .insert({
        empresa_id: profile.empresa_id,
        responsavel_id: ctx.getUserId(),
        titulo: input.titulo,
        descricao: input.descricao ?? null,
        data_vencimento: input.data_vencimento ?? null,
        prioridade: input.prioridade ?? "media",
        prospect_id: input.prospect_id ?? null,
        deal_id: input.deal_id ?? null,
        status: "pending",
      })
      .select()
      .single();

    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: `Task created: ${data.id}` }],
      structuredContent: { task: data },
    };
  },
});
