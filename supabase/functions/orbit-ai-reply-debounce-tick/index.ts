// Tick de recuperação do debounce da resposta ativa.
//
// Só existe para cobrir runtimes que morreram antes de disparar o job em memória.
// NUNCA responde mensagens antigas: apenas linhas `pending` cuja janela venceu
// há mais que a carência e que continuam sendo o claim corrente da conversa.
// Nenhum envio direto: o agente é o produtor, o outbox-tick é o único emissor.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  isRecoverable,
  readDebounceConfig,
  DEBOUNCE_RECOVERY_GRACE_MS,
} from "../_shared/ai-reply-debounce.ts";

const MAX_ATTEMPTS = 3;
/** Não recupera nada mais velho que isso (zero reprocessamento de backlog). */
const MAX_AGE_MS = 10 * 60 * 1000;

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const now = new Date();
  const results: Array<Record<string, unknown>> = [];

  try {
    // Busca com carência ZERO e aplica a carência por tenant abaixo:
    // o default (DEBOUNCE_RECOVERY_GRACE_MS) permanece inalterado.
    const { data: rows, error } = await supabase
      .from("orbit_ai_reply_debounce")
      .select("conversa_id, empresa_id, prospect_id, claim_token, fire_after, status, attempts, last_inbound_at, last_inbound_message_id")
      .eq("status", "pending")
      .lte("fire_after", now.toISOString())
      .gte("fire_after", new Date(now.getTime() - MAX_AGE_MS).toISOString())
      .order("fire_after", { ascending: true })
      .limit(50);
    if (error) throw error;

    for (const row of rows ?? []) {
      if ((row.attempts ?? 0) >= MAX_ATTEMPTS) {
        await supabase.from("orbit_ai_reply_debounce")
          .update({ status: "canceled", last_error: "max_attempts", updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
        results.push({ conversa_id: row.conversa_id, action: "canceled" });
        continue;
      }

      const { data: cfgRow } = await supabase
        .from("orbit_ai_config")
        .select("modo_automatico, ai_reply_debounce")
        .eq("empresa_id", row.empresa_id)
        .maybeSingle();
      const cfg = readDebounceConfig(cfgRow);
      if (!cfg || !cfgRow?.modo_automatico) {
        await supabase.from("orbit_ai_reply_debounce")
          .update({ status: "canceled", last_error: "debounce_disabled", updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
        continue;
      }

      const graceRaw = (cfgRow as any)?.ai_reply_debounce?.recovery_grace_ms;
      const graceMs = Number.isFinite(Number(graceRaw))
        ? Math.min(120_000, Math.max(0, Math.round(Number(graceRaw))))
        : DEBOUNCE_RECOVERY_GRACE_MS;
      if (!isRecoverable(row as any, now, graceMs)) continue;

      const { data: conversa } = await supabase
        .from("orbit_conversas")
        .select("id, human_talk")
        .eq("id", row.conversa_id)
        .maybeSingle();
      if (!conversa || conversa.human_talk === true) {
        await supabase.from("orbit_ai_reply_debounce")
          .update({ status: "canceled", last_error: "human_talk", updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
        continue;
      }

      // Claim atômico: pending -> generating no mesmo token.
      const { data: claimed } = await supabase
        .from("orbit_ai_reply_debounce")
        .update({ status: "generating", attempts: (row.attempts ?? 0) + 1, updated_at: now.toISOString() })
        .eq("conversa_id", row.conversa_id)
        .eq("claim_token", row.claim_token)
        .eq("status", "pending")
        .select("conversa_id");
      if (!claimed || claimed.length === 0) continue;

      // Consolida as inbound pendentes desde o último OUT.
      const { data: lastOut } = await supabase
        .from("orbit_mensagens")
        .select("timestamp")
        .eq("empresa_id", row.empresa_id)
        .eq("conversa_id", row.conversa_id)
        .eq("direcao", "OUT")
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      let q = supabase
        .from("orbit_mensagens")
        .select("mensagem, media_extracted_text, timestamp")
        .eq("empresa_id", row.empresa_id)
        .eq("conversa_id", row.conversa_id)
        .eq("direcao", "IN")
        .order("timestamp", { ascending: true })
        .limit(10);
      if (lastOut?.timestamp) q = q.gt("timestamp", lastOut.timestamp);
      const { data: ins, error: insError } = await q;
      if (insError) {
        // Erro de leitura NUNCA pode ser confundido com "nada a responder":
        // devolve a linha a pending para o próximo tick tentar de novo.
        await supabase.from("orbit_ai_reply_debounce")
          .update({ status: "pending", last_error: "inbound_read_failed", updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
        await supabase.from("orbit_conversas").update({ ai_processing: false }).eq("id", row.conversa_id);
        continue;
      }
      const texts = (ins ?? [])
        .map((m: any) => String(m.mensagem ?? m.media_extracted_text ?? "").trim())
        .filter(Boolean);
      if (texts.length === 0) {
        await supabase.from("orbit_ai_reply_debounce")
          .update({ status: "canceled", last_error: "nothing_to_answer", updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
        await supabase.from("orbit_conversas").update({ ai_processing: false }).eq("id", row.conversa_id);
        continue;
      }

      // Revalidação de POSSE ATUAL imediatamente antes de acionar o agente.
      // handoff_sent_at é histórico e não bloqueia sozinho.
      const { data: freshConversa } = await supabase
        .from("orbit_conversas")
        .select("human_talk, human_user_id")
        .eq("id", row.conversa_id)
        .maybeSingle();
      if (freshConversa?.human_talk === true || freshConversa?.human_user_id) {
        await supabase.from("orbit_conversas").update({ ai_processing: false }).eq("id", row.conversa_id);
        await supabase.from("orbit_ai_reply_debounce")
          .update({ status: "canceled", last_error: "human_talk", updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
        continue;
      }

      const { data: lockResult } = await supabase
        .from("orbit_conversas")
        .update({ ai_processing: true })
        .eq("id", row.conversa_id)
        .eq("ai_processing", false)
        .select("id");
      if (!lockResult || lockResult.length === 0) {
        await supabase.from("orbit_ai_reply_debounce")
          .update({ status: "pending", last_error: "lock_busy", updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
        continue;
      }

      const correlationId = `debounce-recovery:${row.empresa_id}:${row.conversa_id}:${row.claim_token}`;
      const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/orbit-ai-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "x-orbit-internal-secret": Deno.env.get("ORBIT_AI_AGENT_SECRET") ?? "",
          "Idempotency-Key": correlationId,
        },
        body: JSON.stringify({
          conversa_id: row.conversa_id,
          prospect_id: row.prospect_id,
          mensagem: texts.join("\n"),
          telefone: (ins?.[0] as any)?.telefone ?? null,
          correlation_id: correlationId,
          debounced: true,
          batch_size: texts.length,
          received_at: row.last_inbound_at,
        }),
      });
      const ok = resp.ok;
      if (!ok) await supabase.from("orbit_conversas").update({ ai_processing: false }).eq("id", row.conversa_id);
      await supabase.from("orbit_ai_reply_debounce")
        .update({
          status: ok ? "done" : "pending",
          batch_size: texts.length,
          last_error: ok ? null : `agent_${resp.status}`,
          updated_at: new Date().toISOString(),
        })
        .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
      results.push({ conversa_id: row.conversa_id, action: ok ? "recovered" : "retry", batch_size: texts.length });
    }

    return new Response(JSON.stringify({ ok: true, data: { processed: results.length, results } }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[orbit-ai-reply-debounce-tick] falhou:", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ ok: false, error: "tick_failed" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
