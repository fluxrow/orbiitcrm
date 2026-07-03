// Atualiza um template de fluxo OFICIAL aplicando apenas variações permitidas:
// - trocar `template_id` em ações de envio de mensagem
// - trocar `agent_slug` em ações toggle_ai_agent
// Qualquer outro campo (nome, descricao, categoria, estrutura de actions) fica
// preservado. Usa service_role para bypassar o trigger de proteção.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const VariationSchema = z.object({
  template_id: z.string().min(1),
  variations: z.object({
    templates: z.record(z.string().min(1)).optional().default({}),
    agents: z.record(z.string().min(1)).optional().default({}),
  }),
});

const MSG_ACTIONS = new Set(["send_whatsapp_template", "send_email_template", "send_rich_media"]);
const AI_ACTIONS = new Set(["toggle_ai_agent"]);

function walk(actions: any[], visit: (a: any) => void) {
  if (!Array.isArray(actions)) return;
  for (const a of actions) {
    if (!a || typeof a !== "object") continue;
    visit(a);
    const cfg = a.action_config ?? {};
    if (Array.isArray(cfg?.then_actions)) walk(cfg.then_actions, visit);
    if (Array.isArray(cfg?.else_actions)) walk(cfg.else_actions, visit);
    if (Array.isArray(cfg?.cases)) for (const c of cfg.cases) walk(c?.actions ?? [], visit);
    if (Array.isArray(cfg?.default_actions)) walk(cfg.default_actions, visit);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Super-admin gate — usa a função has_role já existente.
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = VariationSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ ok: false, error: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { template_id, variations } = parsed.data;
    const templateMap = variations.templates ?? {};
    const agentMap = variations.agents ?? {};

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: tpl, error: e1 } = await admin
      .from("orbit_flow_templates")
      .select("*")
      .eq("id", template_id)
      .maybeSingle();
    if (e1 || !tpl) {
      return new Response(
        JSON.stringify({ ok: false, error: e1?.message ?? "not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!(tpl as any).is_official) {
      return new Response(
        JSON.stringify({ ok: false, error: "not_official" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const def = JSON.parse(JSON.stringify((tpl as any).definicao ?? {}));
    walk(def?.actions ?? [], (a: any) => {
      const cfg = a.action_config ?? {};
      if (MSG_ACTIONS.has(a.action_type)) {
        const cur = cfg.template_id ?? cfg.templateId;
        if (typeof cur === "string" && templateMap[cur]) {
          if ("template_id" in cfg) cfg.template_id = templateMap[cur];
          if ("templateId" in cfg) cfg.templateId = templateMap[cur];
        }
      }
      if (AI_ACTIONS.has(a.action_type)) {
        const cur = cfg.agent_slug ?? cfg.slug;
        if (typeof cur === "string" && agentMap[cur]) {
          if ("agent_slug" in cfg) cfg.agent_slug = agentMap[cur];
          if ("slug" in cfg) cfg.slug = agentMap[cur];
        }
      }
    });

    const { error: e2 } = await admin
      .from("orbit_flow_templates")
      .update({ definicao: def, updated_at: new Date().toISOString() })
      .eq("id", template_id);
    if (e2) {
      return new Response(
        JSON.stringify({ ok: false, error: e2.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true, data: { template_id } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
