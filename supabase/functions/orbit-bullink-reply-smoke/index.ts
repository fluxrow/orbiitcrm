// Smoke SIMULADO do caminho "nova IN → geração → outbox" do tenant Bullink.
//
// Garantias duras:
//  • empresa_id fixo no código (Bullink). Nenhum outro tenant é tocado.
//  • O prospect sintético nasce com optout_whatsapp=true → o worker da fila NUNCA
//    envia nada real para ele (item vira `ignorado`). Este smoke também não chama
//    o worker nem a Z-API.
//  • Cleanup total no final (mensagens, outbox, sla, debounce, conversa, prospect).
//  • Nenhuma mensagem, conversa ou lead real é lido, alterado ou respondido.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMPRESA_ID = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const tag = `SMOKE_REPLY_${Date.now()}`;
  const phone = `+5500000${Math.floor(Math.random() * 900000 + 100000)}`;
  const report: Record<string, unknown> = { tag, empresa_id: EMPRESA_ID };
  let prospectId: string | null = null;
  let conversaId: string | null = null;

  try {
    const { data: prospect, error: pErr } = await supabase.from("orbit_prospects")
      .insert({ empresa_id: EMPRESA_ID, nome_razao: tag, telefone: phone, optout_whatsapp: true })
      .select("id").single();
    if (pErr) throw new Error(`prospect: ${pErr.message}`);
    prospectId = prospect.id;

    const { data: conversa, error: cErr } = await supabase.from("orbit_conversas")
      .insert({
        empresa_id: EMPRESA_ID,
        prospect_id: prospectId,
        telefone_whatsapp: phone,
        canal: "whatsapp",
        status: "aberta",
        human_talk: false,
        ai_processing: false,
      })
      .select("id").single();
    if (cErr) throw new Error(`conversa: ${cErr.message}`);
    conversaId = conversa.id;

    const receivedAt = new Date();
    const texto = "quanto custa a mentoria?";
    const { data: inMsg, error: mErr } = await supabase.from("orbit_mensagens")
      .insert({
        empresa_id: EMPRESA_ID,
        conversa_id: conversaId,
        direcao: "IN",
        mensagem: texto,
        canal: "whatsapp",
        status: "recebida",
        timestamp: receivedAt.toISOString(),
      })
      .select("id").single();
    if (mErr) throw new Error(`mensagem: ${mErr.message}`);

    const started = Date.now();
    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/orbit-ai-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-orbit-internal-secret": Deno.env.get("ORBIT_AI_AGENT_SECRET") ?? "",
        "Idempotency-Key": tag,
      },
      body: JSON.stringify({
        conversa_id: conversaId,
        prospect_id: prospectId,
        mensagem: texto,
        telefone: phone,
        correlation_id: tag,
        debounced: true,
        batch_size: 1,
        received_at: receivedAt.toISOString(),
      }),
    });
    report.agent_status = resp.status;
    report.agent_latency_ms = Date.now() - started;

    const { data: outRows } = await supabase.from("orbit_mensagens")
      .select("id, direcao, status, mensagem, timestamp")
      .eq("conversa_id", conversaId).eq("direcao", "OUT");
    const { data: outbox } = await supabase.from("orbit_whatsapp_outbox")
      .select("id, source_type, status, payload_type, created_at")
      .eq("conversa_id", conversaId);
    const { data: sla } = await supabase.from("orbit_ai_reply_sla")
      .select("received_at, ai_generated_at, queued_at, sla_ms, wait_ms")
      .eq("conversa_id", conversaId);

    const generated = (outRows ?? [])[0] ?? null;
    report.reply_generated = Boolean(generated);
    report.reply_len = generated ? String((generated as any).mensagem ?? "").length : 0;
    report.reply_mentions_mentoria_price = generated
      ? /6\.?500|6500/.test(String((generated as any).mensagem ?? ""))
      : false;
    report.outbox = outbox;
    report.sla = sla;
    report.total_ms_received_to_queued = (sla ?? [])[0]?.queued_at
      ? Date.parse((sla as any)[0].queued_at) - receivedAt.getTime()
      : null;

    // ── Cleanup total ──
    await supabase.from("orbit_ai_reply_sla").delete().eq("conversa_id", conversaId);
    await supabase.from("orbit_ai_reply_debounce").delete().eq("conversa_id", conversaId);
    await supabase.from("orbit_whatsapp_outbox").delete().eq("conversa_id", conversaId);
    await supabase.from("orbit_mensagens").delete().eq("conversa_id", conversaId);
    await supabase.from("orbit_conversas").delete().eq("id", conversaId);
    await supabase.from("orbit_prospects").delete().eq("id", prospectId);
    report.cleanup = "done";

    return new Response(JSON.stringify({ ok: true, data: report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // Cleanup best-effort mesmo em falha.
    if (conversaId) {
      await supabase.from("orbit_ai_reply_sla").delete().eq("conversa_id", conversaId);
      await supabase.from("orbit_ai_reply_debounce").delete().eq("conversa_id", conversaId);
      await supabase.from("orbit_whatsapp_outbox").delete().eq("conversa_id", conversaId);
      await supabase.from("orbit_mensagens").delete().eq("conversa_id", conversaId);
      await supabase.from("orbit_conversas").delete().eq("id", conversaId);
    }
    if (prospectId) await supabase.from("orbit_prospects").delete().eq("id", prospectId);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e), data: report }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
