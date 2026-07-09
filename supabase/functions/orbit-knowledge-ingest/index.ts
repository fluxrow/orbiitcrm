// orbit-knowledge-ingest
// Recebe uma "fonte" (documento upado, URL ou texto cru), insere chunks
// em orbit_ai_knowledge com status=pending e dispara o processamento
// em background (waitUntil): extrai texto, faz chunking, gera embeddings
// via Lovable AI Gateway (google/gemini-embedding-001) e atualiza status.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const EMBED_MODEL = "google/gemini-embedding-001";
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

type Tipo = "documento" | "url" | "texto";

interface IngestPayload {
  empresa_id: string;
  tipo: Tipo;
  titulo?: string;
  source_url?: string;
  storage_path?: string;
  conteudo_texto?: string;
  reprocess_source_id?: string;
}

function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + size, clean.length);
    chunks.push(clean.slice(i, end));
    if (end >= clean.length) break;
    i = end - overlap;
  }
  return chunks;
}

async function extractFromPdf(bytes: Uint8Array): Promise<string> {
  // unpdf é Deno-friendly (sem dependências nativas)
  const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : String(text || "");
}

async function extractFromDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("https://esm.sh/mammoth@1.8.0");
  const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer as ArrayBuffer });
  return String(result.value || "");
}

// ── SSRF guard ────────────────────────────────────────────────────────────
// Bloqueia esquemas != http/https, hosts internos (localhost, .local, .internal),
// e faixas IP privadas / link-local / metadata cloud.
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return true; // parse falhou -> trata como privado
  }
  const [a, b] = parts;
  if (a === 10) return true;                              // 10.0.0.0/8
  if (a === 127) return true;                             // 127.0.0.0/8
  if (a === 0) return true;                               // 0.0.0.0/8
  if (a === 169 && b === 254) return true;                // 169.254.0.0/16 (link-local + metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;       // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;      // 100.64.0.0/10 CGNAT
  if (a >= 224) return true;                              // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
  if (lower.startsWith("fe80")) return true;                          // link-local
  // IPv4-mapped ::ffff:a.b.c.d
  const m = lower.match(/^::ffff:([\d.]+)$/);
  if (m) return isPrivateIPv4(m[1]);
  return false;
}

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  // metadata cloud names
  if (h === "metadata.google.internal") return true;
  if (h === "metadata" || h === "instance-data") return true;
  // IPv4 literal
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return isPrivateIPv4(h);
  // IPv6 literal (may include brackets)
  if (h.includes(":")) return isPrivateIPv6(h);
  return false;
}

async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("invalid_url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`blocked_scheme: ${u.protocol}`);
  }
  if (isBlockedHost(u.hostname)) {
    throw new Error(`blocked_host: ${u.hostname}`);
  }
  return u;
}

const MAX_URL_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 15_000;

async function extractFromUrl(url: string): Promise<string> {
  let current = await assertSafeUrl(url);

  // Manual redirect handling — revalida cada hop contra IP privado.
  let html = "";
  for (let hop = 0; hop < 5; hop++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (Orbit Knowledge Ingest)" },
        redirect: "manual",
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`redirect_without_location_${res.status}`);
      current = await assertSafeUrl(new URL(loc, current).toString());
      continue;
    }

    if (!res.ok) throw new Error(`fetch_failed: ${res.status}`);

    // Cap response size to avoid huge payloads.
    const reader = res.body?.getReader();
    if (!reader) {
      html = await res.text();
    } else {
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX_URL_BYTES) {
            await reader.cancel().catch(() => {});
            throw new Error("response_too_large");
          }
          chunks.push(value);
        }
      }
      const merged = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.byteLength; }
      html = new TextDecoder().decode(merged);
    }
    break;
  }

  // Extração leve: remove script/style, tira tags, normaliza espaços
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return stripped;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const out: number[][] = [];
  // Lovable Gateway /embeddings — chamamos um por vez para evitar limites de body
  for (const t of texts) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: t }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`embed_failed_${res.status}: ${txt.slice(0, 300)}`);
    }
    const data = await res.json();
    const vec = data?.data?.[0]?.embedding;
    if (!Array.isArray(vec)) throw new Error("embed_invalid_response");
    out.push(vec);
  }
  return out;
}

async function processSource(args: {
  admin: ReturnType<typeof createClient>;
  source_id: string;
  empresa_id: string;
  tipo: Tipo;
  storage_path?: string | null;
  source_url?: string | null;
  conteudo_texto?: string | null;
  titulo?: string | null;
}) {
  const { admin, source_id, empresa_id, tipo } = args;
  try {
    // Marca todos os chunks dessa source como 'processing'
    await admin.from("orbit_ai_knowledge")
      .update({ status: "processing", erro: null })
      .eq("source_id", source_id);

    // 1) Obter texto bruto
    let raw = "";
    if (tipo === "texto") {
      raw = args.conteudo_texto || "";
    } else if (tipo === "url") {
      raw = await extractFromUrl(args.source_url || "");
    } else if (tipo === "documento") {
      if (!args.storage_path) throw new Error("storage_path_missing");
      const { data: file, error: dlErr } = await admin.storage
        .from("orbit-knowledge-base")
        .download(args.storage_path);
      if (dlErr || !file) throw new Error(`download_failed: ${dlErr?.message}`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = (args.storage_path.split(".").pop() || "").toLowerCase();
      if (ext === "pdf") raw = await extractFromPdf(bytes);
      else if (ext === "docx") raw = await extractFromDocx(bytes);
      else if (ext === "txt" || ext === "md") raw = new TextDecoder().decode(bytes);
      else throw new Error(`unsupported_ext: ${ext}`);
    }

    raw = (raw || "").trim();
    if (!raw) throw new Error("empty_content");

    // 2) Chunk
    const chunks = chunkText(raw);
    if (chunks.length === 0) throw new Error("no_chunks");

    // 3) Apagar chunks anteriores (mantém o placeholder com chunk_index=0)
    await admin.from("orbit_ai_knowledge")
      .delete()
      .eq("source_id", source_id)
      .gt("chunk_index", 0);

    // 4) Embed
    const vectors = await embedBatch(chunks);

    // 5) Atualizar chunk 0 + inserir os demais
    const titulo = args.titulo || null;
    const baseRow = {
      empresa_id,
      source_id,
      tipo,
      titulo,
      source_url: args.source_url || null,
      storage_path: args.storage_path || null,
      model_version: EMBED_MODEL,
      ativo: true,
      status: "ready" as const,
      erro: null,
    };

    // Chunk 0 → update do placeholder
    const { error: upErr } = await admin.from("orbit_ai_knowledge")
      .update({
        ...baseRow,
        conteudo_texto: chunks[0],
        embedding: vectors[0] as unknown as string,
        chunk_index: 0,
      })
      .eq("source_id", source_id)
      .eq("chunk_index", 0);
    if (upErr) throw new Error(`update_chunk0_failed: ${upErr.message}`);

    if (chunks.length > 1) {
      const rows = chunks.slice(1).map((c, idx) => ({
        ...baseRow,
        conteudo_texto: c,
        embedding: vectors[idx + 1] as unknown as string,
        chunk_index: idx + 1,
      }));
      const { error: insErr } = await admin.from("orbit_ai_knowledge").insert(rows);
      if (insErr) throw new Error(`insert_chunks_failed: ${insErr.message}`);
    }

    console.log(`[ingest] OK source=${source_id} chunks=${chunks.length}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingest] FAIL source=${source_id}: ${message}`);
    await admin.from("orbit_ai_knowledge")
      .update({ status: "error", erro: message.slice(0, 500) })
      .eq("source_id", source_id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth via client com o JWT do usuário (apenas para validar a sessão)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const payload = (await req.json()) as IngestPayload;
    if (!payload?.empresa_id) return json({ error: "empresa_id_required" }, 400);
    if (!["documento", "url", "texto"].includes(payload.tipo)) {
      return json({ error: "invalid_tipo" }, 400);
    }

    // Admin client (service role) para gravar bypassando RLS internamente
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verificar acesso à empresa via RPC pública do projeto
    const { data: hasAccess } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userData.user.id)
      .eq("empresa_id", payload.empresa_id)
      .maybeSingle();
    const { data: hasMembership } = await admin
      .from("user_empresa_memberships")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("empresa_id", payload.empresa_id)
      .maybeSingle();
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!hasAccess && !hasMembership && !roleRow) {
      return json({ error: "access_denied" }, 403);
    }

    // Reprocessar?
    let source_id: string;
    if (payload.reprocess_source_id) {
      source_id = payload.reprocess_source_id;
      // Reset placeholder
      await admin.from("orbit_ai_knowledge")
        .delete()
        .eq("source_id", source_id)
        .gt("chunk_index", 0);
      await admin.from("orbit_ai_knowledge")
        .update({ status: "pending", erro: null })
        .eq("source_id", source_id);
    } else {
      // Cria placeholder chunk 0 (status pending)
      source_id = crypto.randomUUID();
      const { error: insErr } = await admin.from("orbit_ai_knowledge").insert({
        empresa_id: payload.empresa_id,
        source_id,
        tipo: payload.tipo,
        titulo: payload.titulo || null,
        source_url: payload.source_url || null,
        storage_path: payload.storage_path || null,
        conteudo_texto: payload.tipo === "texto" ? (payload.conteudo_texto || "") : null,
        chunk_index: 0,
        status: "pending",
      });
      if (insErr) return json({ error: `insert_failed: ${insErr.message}` }, 500);
    }

    // Buscar dados completos pra passar pro worker
    const { data: row } = await admin.from("orbit_ai_knowledge")
      .select("source_id, empresa_id, tipo, titulo, source_url, storage_path, conteudo_texto")
      .eq("source_id", source_id)
      .eq("chunk_index", 0)
      .maybeSingle();

    if (!row) return json({ error: "row_not_found_after_insert" }, 500);

    // Background job — não trava a resposta HTTP
    // @ts-ignore: EdgeRuntime existe em Supabase Edge Runtime
    const runtime = (globalThis as any).EdgeRuntime;
    const work = processSource({
      admin,
      source_id: row.source_id as string,
      empresa_id: row.empresa_id as string,
      tipo: row.tipo as Tipo,
      storage_path: row.storage_path as string | null,
      source_url: row.source_url as string | null,
      conteudo_texto: row.conteudo_texto as string | null,
      titulo: row.titulo as string | null,
    });
    if (runtime && typeof runtime.waitUntil === "function") {
      runtime.waitUntil(work);
    } else {
      // Fallback: dispara sem await (best-effort)
      work.catch((e) => console.error("[ingest worker fail]", e));
    }

    return json({ ok: true, source_id, status: "pending" });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error("[orbit-knowledge-ingest] error:", m);
    return json({ error: m }, 500);
  }
});
