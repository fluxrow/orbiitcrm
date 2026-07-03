// Orbit Advisor — Apply (Fase C)
// Aplica uma sugestão pending seguindo whitelist estrita de action.kind.
// Fluxo: (1) auth JWT → empresa_id; (2) carrega sugestão e valida ownership;
// (3) rechecha advisor_locked_paths; (4) monta diff (before/after);
// (5) se confirm=false, retorna preview; (6) se true, chama RPC dedicada,
// registra em orbit_advisor_applied_changes e marca sugestão como applied.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsOptionsResponse } from "../_shared/cors.ts";

type ApplyKind = "flow_pause" | "stage_add_followup_task" | "flow_variation_propose";
const WHITELIST: ApplyKind[] = ["flow_pause", "stage_add_followup_task", "flow_variation_propose"];

function slog(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields }));
}

function json(cors: Record<string, string>, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return corsOptionsResponse(req);

  const runId = crypto.randomUUID();
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(cors, 401, { ok: false, error: "unauthorized" });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) return json(cors, 401, { ok: false, error: "unauthorized" });

    const { data: profile } = await userClient
      .from("profiles")
      .select("empresa_id")
      .eq("id", userId)
      .maybeSingle();
    const userEmpresa = profile?.empresa_id as string | null;
    if (!userEmpresa) return json(cors, 403, { ok: false, error: "no_empresa" });

    const body = await req.json().catch(() => ({}));
    const suggestionId: string | undefined = body?.suggestion_id;
    const confirm: boolean = Boolean(body?.confirm);
    if (!suggestionId) return json(cors, 400, { ok: false, error: "suggestion_id required" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Carrega sugestão
    const { data: sug, error: sugErr } = await admin
      .from("orbit_advisor_suggestions")
      .select("*")
      .eq("id", suggestionId)
      .maybeSingle();
    if (sugErr || !sug) return json(cors, 404, { ok: false, error: "suggestion_not_found" });
    if (sug.empresa_id !== userEmpresa) return json(cors, 403, { ok: false, error: "forbidden" });
    if (sug.status !== "pending") return json(cors, 409, { ok: false, error: `suggestion_status_${sug.status}` });

    const kind = String(sug.action?.kind ?? "") as ApplyKind;
    if (!WHITELIST.includes(kind)) {
      return json(cors, 400, { ok: false, error: "action_not_applicable", kind });
    }

    // Rechecha advisor_locked_paths atual (não confia no snapshot antigo)
    const { data: aiCfg } = await admin
      .from("orbit_ai_config")
      .select("advisor_locked_paths")
      .eq("empresa_id", userEmpresa)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const locked: string[] = Array.isArray(aiCfg?.advisor_locked_paths)
      ? (aiCfg!.advisor_locked_paths as string[])
      : [];
    if (locked.includes(sug.tipo) || locked.includes(kind)) {
      slog("warn", "apply_blocked_by_locked_path", { run_id: runId, suggestion_id: suggestionId, kind });
      return json(cors, 403, { ok: false, error: "blocked_by_locked_path" });
    }

    const targetId: string | undefined = sug.action?.target_id;
    if (!targetId) return json(cors, 400, { ok: false, error: "action_target_id_missing" });

    // Monta preview via mesma RPC quando confirm=false? Simplificação:
    // — para preview, buscamos o estado atual do target sem escrever.
    if (!confirm) {
      const preview = await buildPreview(admin, kind, userEmpresa, targetId, sug);
      slog("info", "apply_preview", { run_id: runId, suggestion_id: suggestionId, kind });
      return json(cors, 200, { ok: true, data: { preview, kind, requires_confirm: true } });
    }

    // Confirm=true: chama a RPC apropriada
    const rpcName =
      kind === "flow_pause" ? "apply_flow_pause"
      : kind === "stage_add_followup_task" ? "apply_stage_followup"
      : "apply_flow_variation_draft";

    const rpcArgs: Record<string, unknown> =
      kind === "stage_add_followup_task"
        ? { p_empresa: userEmpresa, p_stage: targetId, p_template: sug.action?.template ?? {} }
        : kind === "flow_pause"
          ? { p_empresa: userEmpresa, p_flow: targetId }
          : { p_empresa: userEmpresa, p_flow: targetId };

    const { data: rpcRes, error: rpcErr } = await admin.rpc(rpcName as any, rpcArgs);
    if (rpcErr) {
      slog("error", "apply_rpc_failed", { run_id: runId, suggestion_id: suggestionId, kind, error: rpcErr.message });
      return json(cors, 500, { ok: false, error: rpcErr.message });
    }
    const rpc = rpcRes as any;
    if (!rpc?.ok) {
      slog("warn", "apply_rpc_rejected", { run_id: runId, suggestion_id: suggestionId, kind, rpc });
      return json(cors, 400, { ok: false, error: rpc?.error ?? "rpc_failed" });
    }

    // Registra em orbit_advisor_applied_changes
    const { data: applied, error: appErr } = await admin
      .from("orbit_advisor_applied_changes")
      .insert({
        empresa_id: userEmpresa,
        suggestion_id: suggestionId,
        applied_by: userId,
        target_kind: rpc.target_table,
        target_id: rpc.target_id,
        snapshot_before: rpc.before,
        snapshot_after: rpc.after,
      })
      .select("id")
      .single();
    if (appErr) {
      slog("error", "applied_change_insert_failed", { run_id: runId, error: appErr.message });
    }

    // Marca sugestão como applied
    await admin
      .from("orbit_advisor_suggestions")
      .update({
        status: "applied",
        user_confirmed_at: new Date().toISOString(),
        user_confirmed_by: userId,
        applied_change_id: applied?.id ?? null,
      })
      .eq("id", suggestionId);

    slog("info", "apply_done", { run_id: runId, suggestion_id: suggestionId, kind, applied_id: applied?.id });
    return json(cors, 200, {
      ok: true,
      data: {
        applied_id: applied?.id,
        kind,
        target_table: rpc.target_table,
        target_id: rpc.target_id,
        before: rpc.before,
        after: rpc.after,
      },
    });
  } catch (e) {
    slog("error", "apply_fatal", { run_id: runId, error: (e as Error).message });
    return json(cors, 500, { ok: false, error: (e as Error).message });
  }
});

async function buildPreview(
  admin: any,
  kind: ApplyKind,
  empresaId: string,
  targetId: string,
  sug: any,
): Promise<any> {
  if (kind === "flow_pause") {
    const { data } = await admin
      .from("orbit_flows")
      .select("id, nome, ativo")
      .eq("id", targetId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    return {
      target_table: "orbit_flows",
      target_id: targetId,
      target_label: data?.nome ?? targetId,
      before: { ativo: data?.ativo ?? null },
      after: { ativo: false },
      description: `Pausar o fluxo "${data?.nome ?? targetId}". Ele para de disparar novas execuções até ser reativado manualmente. Fluxo original não é excluído.`,
    };
  }
  if (kind === "stage_add_followup_task") {
    const { data: stage } = await admin
      .from("orbit_pipeline_stages")
      .select("id, nome")
      .eq("id", targetId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    const template = sug.action?.template ?? {};
    const titulo = template.titulo ?? `Follow-up automático — ${stage?.nome ?? ""}`;
    const dias = Number(template.dias_prazo ?? 3);
    return {
      target_table: "orbit_tasks",
      target_id: targetId,
      target_label: stage?.nome ?? targetId,
      before: { existing_task: null },
      after: { titulo, tipo_tarefa: "follow_up", dias_prazo: dias, status: "pendente" },
      description: `Criar uma tarefa "${titulo}" com prazo de ${dias} dias para desbloquear leads parados na etapa "${stage?.nome ?? targetId}".`,
    };
  }
  // flow_variation_propose
  const { data: flow } = await admin
    .from("orbit_flows")
    .select("id, nome")
    .eq("id", targetId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  return {
    target_table: "orbit_flow_templates",
    target_id: targetId,
    target_label: flow?.nome ?? targetId,
    before: { source_flow: flow?.nome ?? targetId, action: "nenhuma alteração" },
    after: {
      novo_template: `${flow?.nome ?? "fluxo"} (Draft Advisor)`,
      status: "draft",
      criado_por_advisor: true,
    },
    description: `Criar um RASCUNHO de variação do fluxo "${flow?.nome ?? targetId}" com sufixo "(Draft Advisor)" em Templates. O fluxo original permanece intocado — você abre o rascunho, revisa e só publica se quiser.`,
  };
}
