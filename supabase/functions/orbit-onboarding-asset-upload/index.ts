import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

// Público (token-based). verify_jwt=false no config.toml.
// Recebe base64 do arquivo e sobe no bucket privado `orbit-media`,
// registrando linha em `orbit_onboarding_assets`.

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_MIME_PREFIXES = ["image/", "audio/", "video/", "application/", "text/"];

interface Body {
  token: string;
  section_key: string;
  field_key: string;
  item_id?: string;
  filename: string;
  mime?: string;
  data_base64: string; // sem prefixo data:
}

function safeName(s: string): string {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

function base64ToBytes(b64: string): Uint8Array {
  // aceita string com ou sem prefixo data:
  const clean = b64.includes(",") ? b64.split(",", 2)[1] : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = (await req.json()) as Body;
    if (!body?.token || !body?.section_key || !body?.field_key || !body?.filename || !body?.data_base64) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Campos obrigatórios ausentes", 400, undefined, req);
    }

    // Valida token do onboarding (usa a RPC pública já existente)
    const { data: rpc, error: rpcErr } = await supabase.rpc("get_onboarding_by_token" as any, {
      p_token: body.token,
    });
    if (rpcErr) return fail(ErrorCodes.INTERNAL_ERROR, rpcErr.message, 500, undefined, req);
    const res = rpc as any;
    if (!res?.ok) return fail(ErrorCodes.NOT_FOUND, "Token inválido", 404, undefined, req);

    // A RPC retorna dados públicos; precisamos do empresa_id/onboarding_id (service role).
    const { data: row, error: rowErr } = await supabase
      .from("orbit_client_onboardings")
      .select("id, empresa_id, archived, status")
      .eq("public_token", body.token)
      .maybeSingle();
    if (rowErr || !row) return fail(ErrorCodes.NOT_FOUND, "Onboarding não encontrado", 404, undefined, req);
    if (row.archived) return fail(ErrorCodes.FORBIDDEN, "Onboarding arquivado", 403, undefined, req);

    const mime = body.mime || "application/octet-stream";
    if (!ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
      return fail(ErrorCodes.VALIDATION_ERROR, `Tipo não permitido: ${mime}`, 400, { mime }, req);
    }

    // Validação de tamanho ANTES de decodificar: base64 tem ~4/3 do tamanho real.
    // Evita alocar centenas de MB só para descobrir que o arquivo excede o limite.
    const b64 = body.data_base64.includes(",") ? body.data_base64.split(",", 2)[1] : body.data_base64;
    const approxBytes = Math.floor((b64.length * 3) / 4);
    if (approxBytes === 0) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Arquivo vazio", 400, undefined, req);
    }
    if (approxBytes > MAX_SIZE) {
      return fail(
        ErrorCodes.VALIDATION_ERROR,
        `Arquivo excede 20MB (~${approxBytes} bytes)`,
        400,
        { approx_bytes: approxBytes, max_bytes: MAX_SIZE },
        req,
      );
    }

    const fname = safeName(body.filename);

    // ── Idempotência: retry do MESMO item/campo com o mesmo arquivo devolve o
    // asset já registrado em vez de criar duplicata no Storage e na tabela.
    if (body.item_id) {
      const { data: prev } = await supabase
        .from("orbit_onboarding_assets")
        .select("id, storage_path, filename, mime, size_bytes")
        .eq("onboarding_id", row.id)
        .eq("field_key", body.field_key)
        .eq("item_id", body.item_id)
        .eq("filename", fname)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prev && Math.abs(Number(prev.size_bytes ?? 0) - approxBytes) <= 4) {
        let signed_url: string | null = null;
        try {
          const { data: sig } = await supabase.storage
            .from("orbit-media")
            .createSignedUrl(prev.storage_path, 60 * 60);
          signed_url = sig?.signedUrl ?? null;
        } catch (_e) { /* preview best-effort */ }
        return ok(
          {
            asset_id: prev.id,
            storage_path: prev.storage_path,
            filename: prev.filename,
            mime: prev.mime,
            size_bytes: prev.size_bytes,
            signed_url,
            idempotent: true,
          },
          undefined,
          req,
        );
      }
    }

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(body.data_base64);
    } catch (_e) {
      return fail(ErrorCodes.VALIDATION_ERROR, "data_base64 inválido", 400, undefined, req);
    }
    if (bytes.byteLength === 0) return fail(ErrorCodes.VALIDATION_ERROR, "Arquivo vazio", 400, undefined, req);
    if (bytes.byteLength > MAX_SIZE) {
      return fail(ErrorCodes.VALIDATION_ERROR, `Arquivo excede 20MB (${bytes.byteLength} bytes)`, 400, undefined, req);
    }

    const assetId = crypto.randomUUID();
    const storagePath = `${row.empresa_id}/onboarding/${row.id}/${assetId}-${fname}`;


    const { error: upErr } = await supabase.storage
      .from("orbit-media")
      .upload(storagePath, bytes, { contentType: mime, upsert: false });
    if (upErr) return fail(ErrorCodes.INTERNAL_ERROR, `Falha no upload: ${upErr.message}`, 500, undefined, req);

    const { data: inserted, error: insErr } = await supabase
      .from("orbit_onboarding_assets")
      .insert({
        id: assetId,
        empresa_id: row.empresa_id,
        onboarding_id: row.id,
        section_key: body.section_key,
        field_key: body.field_key,
        item_id: body.item_id ?? null,
        storage_path: storagePath,
        filename: fname,
        mime,
        size_bytes: bytes.byteLength,
      })
      .select("id, storage_path, filename, mime, size_bytes")
      .single();

    if (insErr || !inserted) {
      // Rollback do upload
      await supabase.storage.from("orbit-media").remove([storagePath]).catch(() => {});
      return fail(ErrorCodes.INTERNAL_ERROR, insErr?.message || "Falha ao registrar asset", 500, undefined, req);
    }

    // Assina URL temporária (1h) só para preview imediato no wizard —
    // não é persistida no responses; admin regenera sob demanda.
    let signed_url: string | null = null;
    try {
      const { data: sig } = await supabase.storage
        .from("orbit-media")
        .createSignedUrl(inserted.storage_path, 60 * 60);
      signed_url = sig?.signedUrl ?? null;
    } catch (_e) { /* preview é best-effort */ }

    return ok(
      {
        asset_id: inserted.id,
        storage_path: inserted.storage_path,
        filename: inserted.filename,
        mime: inserted.mime,
        size_bytes: inserted.size_bytes,
        signed_url,
      },
      undefined,
      req,
    );

  } catch (e) {
    return fail(ErrorCodes.INTERNAL_ERROR, (e as Error).message, 500, undefined, req);
  }
});
