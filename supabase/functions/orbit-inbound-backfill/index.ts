// Admin job idempotente e auditável: reprocessa inbound perdido a partir de
// orbit_webhook_logs.
//
// Invariantes de segurança:
//  • exige Authorization: Bearer <service role key> (job interno);
//  • escopo obrigatório por instance_id (um tenant por execução);
//  • nunca reprocessa fromMe=true, grupo, broadcast, newsletter ou status;
//  • idempotente por (empresa_id, provider_message_id);
//  • NUNCA chama Z-API: a resposta do agente só entra no orbit_whatsapp_outbox;
//  • no máximo UMA resposta do agente por conversa (a mais recente sem resposta);
//  • contato sem prospect vinculado fica visível, mas sem resposta automática;
//  • relatório agregado, sem PII (telefones e textos não são expostos).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  consolidateAgentReplies,
  phoneVariants,
  resolveEmpresaByInstance,
  safePreview,
  selectBackfillCandidates,
  type BackfillEvent,
} from "../_shared/inbound-zapi.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!serviceKey || (req.headers.get("Authorization") || "") !== `Bearer ${serviceKey}`) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const instanceId = String(body.instance_id || "").trim();
  const mode = body.mode === "execute" ? "execute" : "preview";
  const limit = Math.min(Math.max(Number(body.limit ?? 500), 1), 2000);
  const enqueueReplies = body.enqueue_replies === true;
  if (!instanceId) return json({ ok: false, error: "instance_id_required" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: zapiRows } = await supabase
    .from("orbit_zapi_config")
    .select("empresa_id")
    .eq("instance_id", instanceId);
  const { empresaId, reason } = resolveEmpresaByInstance(zapiRows);
  if (!empresaId) return json({ ok: false, error: reason ?? "instance_unresolved" }, 409);

  const { data: logs } = await supabase
    .from("orbit_webhook_logs")
    .select("id, payload, created_at")
    .eq("instance_id", instanceId)
    .eq("event_type", "on-receive")
    .order("created_at", { ascending: true })
    .limit(5000);

  const events: BackfillEvent[] = (logs ?? []).map((row: any) => ({
    log_id: row.id,
    payload: row.payload ?? {},
    created_at: row.created_at,
  }));
  const { candidates, skipped } = selectBackfillCandidates(events);

  // Idempotência: descarta o que já existe neste tenant.
  const existing = new Set<string>();
  for (let i = 0; i < candidates.length; i += 200) {
    const slice = candidates.slice(i, i + 200).map((c) => c.provider_message_id);
    const { data: rows } = await supabase
      .from("orbit_mensagens")
      .select("provider_message_id")
      .eq("empresa_id", empresaId)
      .in("provider_message_id", slice);
    for (const row of rows ?? []) existing.add(String(row.provider_message_id));
  }
  const missing = candidates.filter((c) => !existing.has(c.provider_message_id)).slice(0, limit);

  const report: Record<string, unknown> = {
    ok: true,
    mode,
    empresa_id: empresaId,
    logs_scanned: events.length,
    eligible: candidates.length,
    already_present: existing.size,
    missing: missing.length,
    skipped,
  };
  if (mode === "preview") return json(report);

  // ── EXECUTE ──
  const conversaCache = new Map<string, { id: string; prospect_id: string | null; unread: number }>();
  const inserted: Array<{ conversa_id: string; prospect_id: string | null; provider_message_id: string; mensagem: string; telefone: string; timestamp: string }> = [];
  const errors: string[] = [];
  let createdConversas = 0;
  let unlinkedContacts = 0;

  for (const item of missing) {
    try {
      const variants = phoneVariants(item.phone);
      let cached = conversaCache.get(item.phone);

      if (!cached) {
        const { data: prospectRows } = await supabase
          .from("orbit_prospects")
          .select("id")
          .eq("empresa_id", empresaId)
          .or(variants.map((v) => `whatsapp.eq.${v},telefone.eq.${v}`).join(","))
          .order("created_at", { ascending: true })
          .limit(1);
        const prospectId: string | null = prospectRows?.[0]?.id ?? null;
        if (!prospectId) unlinkedContacts++;

        let conversaRow: any = null;
        const { data: byPhone } = await supabase
          .from("orbit_conversas")
          .select("id, prospect_id, mensagens_nao_lidas")
          .eq("empresa_id", empresaId)
          .eq("canal", "whatsapp")
          .in("telefone_whatsapp", variants)
          .order("ultima_mensagem_at", { ascending: false, nullsFirst: false })
          .limit(1);
        conversaRow = byPhone?.[0] ?? null;

        if (!conversaRow) {
          const { data: created, error: createError } = await supabase
            .from("orbit_conversas")
            .insert({
              empresa_id: empresaId,
              prospect_id: prospectId,
              telefone_whatsapp: item.phone,
              canal: "whatsapp",
              status: "aberta",
              human_talk: false,
              mensagens_nao_lidas: 0,
            })
            .select("id, prospect_id, mensagens_nao_lidas")
            .single();
          if (createError) throw createError;
          conversaRow = created;
          createdConversas++;
        }

        cached = {
          id: conversaRow.id,
          prospect_id: conversaRow.prospect_id ?? prospectId,
          unread: conversaRow.mensagens_nao_lidas ?? 0,
        };
        conversaCache.set(item.phone, cached);
      }

      const { error: insertError } = await supabase.from("orbit_mensagens").insert({
        conversa_id: cached.id,
        empresa_id: empresaId,
        direcao: "IN",
        canal: "whatsapp",
        status: "recebida",
        mensagem: item.content.messageText || (item.content.tipoMidia ? `📎 ${item.content.tipoMidia}` : ""),
        tipo_midia: item.content.tipoMidia,
        url_midia: item.content.urlMidia,
        media_processing_status: item.content.tipoMidia ? "disabled" : null,
        provider_message_id: item.provider_message_id,
        timestamp: item.timestamp,
      });
      if (insertError) {
        if ((insertError as any).code === "23505") continue; // já existe: idempotente
        throw insertError;
      }

      cached.unread += 1;
      inserted.push({
        conversa_id: cached.id,
        prospect_id: cached.prospect_id,
        provider_message_id: item.provider_message_id,
        mensagem: item.content.messageText,
        telefone: item.phone,
        timestamp: item.timestamp,
      });

      await supabase
        .from("orbit_conversas")
        .update({
          ultima_mensagem_at: item.timestamp,
          ultima_mensagem_preview: safePreview(item.content.messageText, item.content.tipoMidia),
          mensagens_nao_lidas: cached.unread,
        })
        .eq("id", cached.id);
    } catch (error) {
      errors.push(error instanceof Error ? error.message.slice(0, 160) : "unknown");
    }
  }

  // Cancela D+1/D+3 dos prospects que responderam.
  let actionsCanceled = 0;
  let outboxCanceled = 0;
  for (const prospectId of new Set(inserted.map((i) => i.prospect_id).filter(Boolean) as string[])) {
    const { data: canceled } = await supabase.rpc("cancel_cadence_on_reply", {
      _empresa_id: empresaId,
      _prospect_id: prospectId,
      _reason: "replied",
    });
    actionsCanceled += Number((canceled as any)?.actions_canceled ?? 0);
    outboxCanceled += Number((canceled as any)?.outbox_canceled ?? 0);
  }

  // Consolida: no máximo UMA resposta por conversa, para o inbound mais recente
  // ainda sem resposta OUT posterior. Nunca uma resposta por evento histórico.
  const targets = consolidateAgentReplies(inserted as any);
  const pending: typeof targets = [];
  for (const target of targets) {
    const { data: lastOut } = await supabase
      .from("orbit_mensagens")
      .select("timestamp")
      .eq("conversa_id", target.conversa_id)
      .eq("direcao", "OUT")
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastOut?.timestamp && String(lastOut.timestamp) > target.timestamp) continue;
    pending.push(target);
  }

  let repliesEnqueued = 0;
  if (enqueueReplies) {
    const { data: aiConfig } = await supabase
      .from("orbit_ai_config")
      .select("modo_automatico")
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (aiConfig?.modo_automatico) {
      for (const target of pending) {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/orbit-ai-agent`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
              "x-orbit-internal-secret": Deno.env.get("ORBIT_AI_AGENT_SECRET") ?? "",
              "Idempotency-Key": `backfill:${empresaId}:${target.provider_message_id}`,
            },
            body: JSON.stringify({
              conversa_id: target.conversa_id,
              prospect_id: target.prospect_id,
              mensagem: target.mensagem,
              telefone: target.telefone,
              correlation_id: `backfill:${empresaId}:${target.provider_message_id}`,
            }),
          });
          if (response.ok) repliesEnqueued++;
          else errors.push(`agent_${response.status}`);
        } catch (error) {
          errors.push(error instanceof Error ? `agent:${error.message.slice(0, 80)}` : "agent_unknown");
        }
      }
    }
  }

  await supabase.from("orbit_webhook_logs").insert({
    event_type: "inbound_backfill",
    instance_id: instanceId,
    status: errors.length ? "partial" : "ok",
    payload: {
      empresa_id: empresaId,
      logs_scanned: events.length,
      eligible: candidates.length,
      inserted: inserted.length,
      created_conversas: createdConversas,
      unlinked_contacts: unlinkedContacts,
      actions_canceled: actionsCanceled,
      outbox_canceled: outboxCanceled,
      reply_candidates: pending.length,
      replies_enqueued: repliesEnqueued,
      errors: errors.slice(0, 10),
    },
  });

  return json({
    ...report,
    inserted: inserted.length,
    created_conversas: createdConversas,
    unlinked_contacts: unlinkedContacts,
    actions_canceled: actionsCanceled,
    outbox_canceled: outboxCanceled,
    reply_candidates: pending.length,
    replies_enqueued: repliesEnqueued,
    errors: errors.slice(0, 10),
  });
});
