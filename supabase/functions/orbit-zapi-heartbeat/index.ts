// orbit-zapi-heartbeat
// Cron a cada 15 minutos: consulta /status de TODA instância Z-API ativa.
//
// SEGURANÇA
//  • Autenticado via SCHEDULER_CRON_TOKEN (mesmo padrão dos outros ticks).
//  • Somente LEITURA na Z-API (endpoint /status). Nunca envia mensagem a lead.
//  • Instância offline → instance_offline=true + fila do tenant pausada
//    (fail-closed) + alerta operacional com cooldown.
//  • Nenhum token aparece em log ou resposta.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getOrbitZapiRuntimeConfig } from "../_shared/orbit-zapi.ts";
import { zapiBaseUrl } from "../_shared/zapi-media.ts";
import {
  classifyZapiFailure,
  markZapiInstanceOffline,
  markZapiInstanceOnline,
  markOfflineAlertSent,
  sanitizeZapiReason,
} from "../_shared/zapi-connection.ts";
import { sendOpsOfflineAlert } from "../_shared/zapi-ops-alert.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("SCHEDULER_CRON_TOKEN") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Interpreta o corpo de /status da Z-API. */
export function interpretZapiStatus(body: any): { online: boolean; reason: string } {
  const connected = body?.connected === true;
  const smartphone = body?.smartphoneConnected;
  const error = body?.error || body?.message || null;

  if (connected && smartphone !== false) return { online: true, reason: "connected" };
  if (connected && smartphone === false) {
    return { online: false, reason: "phone-disconnected: smartphoneConnected=false" };
  }
  return { online: false, reason: sanitizeZapiReason(error || "session-disconnected", 200) };
}

Deno.serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const auth = req.headers.get("Authorization") || "";
    if (!CRON_TOKEN || auth !== `Bearer ${CRON_TOKEN}`) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: configs } = await supabase
      .from("orbit_zapi_config")
      .select("id, empresa_id, instance_id, instance_offline")
      .eq("ativo", true);

    const results: Array<Record<string, unknown>> = [];

    for (const row of ((configs as any[]) ?? [])) {
      if (!row.empresa_id || !row.instance_id) continue;
      try {
        const cfg = await getOrbitZapiRuntimeConfig(supabase, row.empresa_id);
        if (!cfg?.instance_id || !cfg?.token) {
          results.push({ empresa_id: row.empresa_id, skipped: "credenciais_ausentes" });
          continue;
        }

        const resp = await fetch(`${zapiBaseUrl(cfg)}/status`, {
          headers: { "Client-Token": cfg.client_token || "" },
        });
        const json = await resp.json().catch(() => ({}));

        let online: boolean;
        let reason: string;
        let statusCode: number | null = resp.status;
        let eventType = "heartbeat";
        let blockSeconds: number | null = null;

        if (!resp.ok) {
          const cls = classifyZapiFailure(resp.status, json);
          online = false;
          reason = cls.reason;
          eventType = cls.event_type;
          blockSeconds = cls.blockSeconds;
        } else {
          const interpreted = interpretZapiStatus(json);
          online = interpreted.online;
          reason = interpreted.reason;
          statusCode = null;
          eventType = online ? "online" : "session-disconnected";
        }

        if (online) {
          const res = await markZapiInstanceOnline(supabase, {
            empresa_id: row.empresa_id,
            source: "heartbeat",
          });
          results.push({ empresa_id: row.empresa_id, online: true, recovered: res.recovered });
          continue;
        }

        const marked = await markZapiInstanceOffline(supabase, {
          empresa_id: row.empresa_id,
          zapi_config_id: row.id,
          instance_id: row.instance_id,
          reason,
          source: "heartbeat",
          event_type: eventType,
          status_code: statusCode,
          blockSeconds,
        });

        let alerted = false;
        if (marked.shouldAlert) {
          const alert = await sendOpsOfflineAlert(supabase, {
            empresa_id: marked.empresa_id,
            instance_id: marked.instance_id,
            reason,
            event_type: eventType,
            status_code: statusCode,
          });
          alerted = alert.sent;
          await markOfflineAlertSent(supabase, {
            config_id: marked.config_id,
            event_id: marked.event_id,
            error: alert.sent ? null : alert.error ?? "alert_failed",
          });
        }

        results.push({
          empresa_id: row.empresa_id,
          online: false,
          reason,
          paused_outbox: marked.paused_outbox,
          alerted,
        });
      } catch (e) {
        results.push({
          empresa_id: row.empresa_id,
          error: sanitizeZapiReason(e instanceof Error ? e.message : String(e), 160),
        });
      }
    }

    console.log("[orbit-zapi-heartbeat] processados:", results.length);
    return new Response(JSON.stringify({ ok: true, checked: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  });
