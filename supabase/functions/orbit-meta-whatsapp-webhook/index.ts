import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  extractMetaPhoneNumberIds,
  metaMessageToOrbitPayload,
  type OrbitMetaWhatsAppRuntimeConfig,
  verifyMetaHmacSha256,
} from "../_shared/meta-whatsapp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("ORBIT_WEBHOOK_SECRET") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const jsonHeaders = { "Content-Type": "application/json" };

async function verifyChallenge(url: URL): Promise<Response> {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (mode !== "subscribe" || !token || !challenge) {
    return new Response("Forbidden", { status: 403 });
  }
  const { data, error } = await supabase.rpc(
    "verify_orbit_meta_whatsapp_webhook_token",
    { p_token: token },
  );
  if (error || data !== true) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

async function getRuntimeByPhoneId(
  phoneNumberId: string,
): Promise<OrbitMetaWhatsAppRuntimeConfig | null> {
  const { data, error } = await supabase.rpc(
    "get_orbit_meta_whatsapp_runtime_config_by_phone_id",
    { p_phone_number_id: phoneNumberId },
  );
  if (error) {
    throw new Error(`meta_config_lookup_failed:${error.code ?? "unknown"}`);
  }
  return (data as OrbitMetaWhatsAppRuntimeConfig | null) ?? null;
}

async function updateDeliveryStatuses(
  body: any,
  empresaId: string,
): Promise<number> {
  let updated = 0;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        const providerId = String(status?.id ?? "");
        const value = String(status?.status ?? "");
        if (!providerId || !value) continue;
        const errorCode = status?.errors?.[0]?.code
          ? `META_STATUS_${status.errors[0].code}`
          : null;
        await supabase.from("orbit_mensagens").update({
          status: value,
          erro: value === "failed" ? errorCode ?? "META_DELIVERY_FAILED" : null,
        }).eq("empresa_id", empresaId).eq("provider_message_id", providerId);
        if (value === "failed") {
          await supabase.from("orbit_whatsapp_outbox").update({
            status: "failed",
            last_error: errorCode ?? "META_DELIVERY_FAILED",
          }).eq("empresa_id", empresaId).eq("provider_message_id", providerId);
        }
        updated++;
      }
    }
  }
  return updated;
}

async function forwardInbound(
  body: any,
  empresaId: string,
  phoneNumberId: string,
): Promise<number> {
  if (!WEBHOOK_SECRET) throw new Error("orbit_webhook_secret_missing");
  let accepted = 0;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      if (String(value.metadata?.phone_number_id ?? "") !== phoneNumberId) {
        continue;
      }
      for (const message of value.messages ?? []) {
        const mapped = metaMessageToOrbitPayload(message, phoneNumberId);
        if (!mapped) {
          await supabase.from("orbit_audit_log").insert({
            empresa_id: empresaId,
            acao: "meta_whatsapp_inbound_unsupported",
            entidade: "meta_whatsapp_webhook",
            detalhes: {
              message_id_prefix: String(message?.id ?? "").slice(0, 12),
              type: String(message?.type ?? "unknown"),
            },
          });
          continue;
        }
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/orbit-webhook?event=on-receive`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": WEBHOOK_SECRET,
              "x-orbit-provider": "meta_whatsapp",
            },
            body: JSON.stringify(mapped),
          },
        );
        if (!response.ok) {
          throw new Error(`orbit_webhook_forward_failed:${response.status}`);
        }
        accepted++;
      }
    }
  }
  return accepted;
}

async function processVerified(
  body: any,
  config: OrbitMetaWhatsAppRuntimeConfig,
): Promise<void> {
  const statuses = await updateDeliveryStatuses(body, config.empresa_id);
  const inbound = await forwardInbound(
    body,
    config.empresa_id,
    config.phone_number_id!,
  );
  await supabase.from("orbit_audit_log").insert({
    empresa_id: config.empresa_id,
    acao: "meta_whatsapp_webhook_processed",
    entidade: "meta_whatsapp_webhook",
    detalhes: {
      statuses,
      inbound,
      phone_number_id_suffix: config.phone_number_id!.slice(-4),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "GET") return await verifyChallenge(new URL(req.url));
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await req.text();
  if (rawBody.length > 1_000_000) {
    return new Response("Payload Too Large", { status: 413 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }
  if (body?.object !== "whatsapp_business_account") {
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  const phoneIds = extractMetaPhoneNumberIds(body);
  if (phoneIds.length !== 1) {
    return new Response(
      JSON.stringify({ ok: false, error: "phone_number_id_unresolved" }),
      {
        status: 400,
        headers: jsonHeaders,
      },
    );
  }

  let config: OrbitMetaWhatsAppRuntimeConfig | null;
  try {
    config = await getRuntimeByPhoneId(phoneIds[0]);
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "configuration_lookup_failed" }),
      {
        status: 503,
        headers: jsonHeaders,
      },
    );
  }
  if (!config?.app_secret || !config.phone_number_id) {
    return new Response(
      JSON.stringify({ ok: false, error: "provider_not_active" }),
      {
        status: 403,
        headers: jsonHeaders,
      },
    );
  }

  const signatureOk = await verifyMetaHmacSha256(
    rawBody,
    req.headers.get("x-hub-signature-256"),
    config.app_secret,
  );
  if (!signatureOk) return new Response("Forbidden", { status: 403 });
  if (!WEBHOOK_SECRET) {
    return new Response(
      JSON.stringify({ ok: false, error: "internal_pipeline_not_configured" }),
      { status: 503, headers: jsonHeaders },
    );
  }

  try {
    // O pipeline interno responde com ACK rápido; aguardá-lo aqui garante que a
    // Meta repita o webhook se a entrega ao Orbit falhar, em vez de perder o IN.
    await processVerified(body, config);
  } catch (error) {
    console.error(
      "[orbit-meta-whatsapp-webhook] processing failed",
      error instanceof Error ? error.message : String(error),
    );
    return new Response(
      JSON.stringify({ ok: false, error: "pipeline_delivery_failed" }),
      { status: 503, headers: jsonHeaders },
    );
  }

  return new Response(JSON.stringify({ ok: true, accepted: true }), {
    status: 200,
    headers: jsonHeaders,
  });
});
