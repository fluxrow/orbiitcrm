// Orbit Advisor — chat streaming com tools read-only (Fase 1).
// Fluxo:
//   1. Autentica JWT do usuário, resolve empresa_id.
//   2. Monta contexto: get_advisor_snapshot(empresa_id) + histórico da thread.
//   3. Chama Lovable AI Gateway (chat completions) com stream=true.
//   4. Tool-calling loop: se o modelo chama uma das tools read-only,
//      resolve com SERVICE_ROLE (tenant-scoped), retorna resultado e continua.
//   5. Retorna SSE cru para o cliente (chunks OpenAI-compatible).
//   6. Ao final, persiste user+assistant messages na thread.
//
// Tools disponíveis: get_flow_definition, get_recent_flow_errors,
// get_stage_drop_sample, get_template_content.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsOptionsResponse } from "../_shared/cors.ts";

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const MAX_TOOL_ITERATIONS = 4;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_flow_definition",
      description: "Retorna a definicao JSON de um fluxo (orbit_flows) para inspecao.",
      parameters: {
        type: "object",
        properties: { flow_id: { type: "string", description: "UUID do fluxo" } },
        required: ["flow_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_flow_errors",
      description: "Ultimos erros de execucao de um fluxo (max 10).",
      parameters: {
        type: "object",
        properties: {
          flow_id: { type: "string" },
          limit: { type: "number", description: "1-10" },
        },
        required: ["flow_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stage_drop_sample",
      description: "Amostra de prospects que ficaram parados numa etapa do funil (max 10).",
      parameters: {
        type: "object",
        properties: {
          stage_id: { type: "string" },
          limit: { type: "number" },
        },
        required: ["stage_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_template_content",
      description: "Retorna o conteudo de um template de mensagem (orbit_message_templates).",
      parameters: {
        type: "object",
        properties: { template_id: { type: "string" } },
        required: ["template_id"],
      },
    },
  },
];

function buildSystemPrompt(snapshot: any) {
  const ai = snapshot?.ai_config ?? {};
  const locked = Array.isArray(ai.advisor_locked_paths) ? ai.advisor_locked_paths : [];
  const empresaNome = snapshot?.empresa?.nome ?? "?";

  return `# Papel
Você é o **Orbit Advisor** — consultor sênior de Customer Success in-app do CRM Orbit para a empresa "${empresaNome}". Fale como quem já cuidou de dezenas de operações comerciais: direto, específico, com opinião. Nada de linguagem corporativa vazia ("otimizar sinergias", "alavancar processos"). Trate o usuário como um par que sabe do próprio negócio — sua vantagem é enxergar o que os números do sistema estão dizendo.

# Regras invioláveis
1. **Zero invenção.** Toda métrica, nome de fluxo, etapa ou template DEVE vir do snapshot ou de uma chamada de tool. Se não sabe, diga "não tenho esse dado no snapshot, quer que eu busque?".
2. **Cite o número.** Não fale "seu funil está devagar"; fale "a etapa Qualificação tem 23 leads parados há 7+ dias, zero movimentação nesta semana".
3. **Respeite os caminhos travados do cliente** (lista abaixo). Não sugira mudar nada listado ali, nem indiretamente.
4. **Nunca aplique nada sozinho.** Termine toda proposta de mudança com uma pergunta explícita: "posso aplicar essa alteração?" — o usuário confirma no botão "Aplicar", que mostra o diff antes de executar.
5. Use tools só para dados que não estão no snapshot pré-agregado.
6. Português brasileiro, sem jargão gringo desnecessário.

# Formato da resposta (quando for propor uma otimização)
1. **Diagnóstico** — 1 frase com a métrica que disparou o alerta.
2. **Hipótese** — 1 frase com a causa provável.
3. **Ação sugerida** — o que mudar, com custo/benefício estimado em 1 linha.
4. **Pergunta** — "posso aplicar essa alteração?" (ou "quer que eu detalhe o diff antes?").

Para perguntas informativas (sem proposta), seja ainda mais breve: número + interpretação em 2-3 frases.

# Exemplos de tom (few-shot)

**Ex. 1 — spike de erro em fluxo**
"O fluxo *Boas-vindas WhatsApp* rodou 47x nas últimas 24h e falhou 12 vezes — 25% de erro, o triplo do que seria aceitável. Olhando o último erro (timeout no envio da Z-API), o gargalo é externo, não lógico. Sugiro **pausar esse fluxo por 2h** enquanto você confirma a conectividade da Z-API. Impacto: nenhum lead novo entra na régua até destravar, mas você para de queimar tentativas contra uma API que está caindo. Posso aplicar essa pausa?"

**Ex. 2 — estagnação de etapa**
"A etapa *Proposta Enviada* tem 18 leads parados há mais de 7 dias sem movimentação. Provavelmente falta um lembrete pro vendedor — nenhuma tarefa de follow-up dispara automaticamente ao entrar nessa etapa. Sugiro **criar uma tarefa de follow-up de 3 dias** para todos os leads futuros que caírem aí. Impacto: cada vendedor recebe um empurrão sem depender de memória. Posso aplicar?"

# Regras invioláveis do cliente (não sugira mudar estes caminhos)
${locked.length ? locked.map((p: string) => `- ${p}`).join("\n") : "- (nenhuma configurada)"}

# Snapshot operacional (JSON já pré-agregado)
\`\`\`json
${JSON.stringify(snapshot, null, 2).slice(0, 6000)}
\`\`\`
`;
}


Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return corsOptionsResponse(req);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return new Response(JSON.stringify({ ok: false, error: "LOVABLE_API_KEY missing" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { empresa_id, thread_id, message } = body ?? {};
    if (!empresa_id || !message || typeof message !== "string") {
      return new Response(JSON.stringify({ ok: false, error: "empresa_id and message required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Valida acesso e monta contexto via user client (RLS aplica)
    const { data: snapshot, error: snapErr } = await userClient.rpc(
      "get_advisor_snapshot",
      { p_empresa_id: empresa_id },
    );
    if (snapErr) {
      return new Response(JSON.stringify({ ok: false, error: snapErr.message }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // service_role para escrever mensagens/thread e para tools
    const admin = createClient(supabaseUrl, serviceKey);

    // Resolve/cria thread
    let threadId = thread_id as string | undefined;
    if (!threadId) {
      const { data: t } = await admin
        .from("orbit_advisor_threads")
        .insert({
          empresa_id,
          user_id: userId,
          titulo: message.slice(0, 60),
        })
        .select("id")
        .single();
      threadId = t?.id;
    }
    if (!threadId) {
      return new Response(JSON.stringify({ ok: false, error: "thread create failed" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Histórico (últimas 12 msgs)
    const { data: history } = await admin
      .from("orbit_advisor_messages")
      .select("role, content")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(12);

    const messages: any[] = [
      { role: "system", content: buildSystemPrompt(snapshot) },
      ...(history ?? []).map((m: any) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : (m.content?.text ?? JSON.stringify(m.content)),
      })),
      { role: "user", content: message },
    ];

    // Persiste user message imediatamente
    await admin.from("orbit_advisor_messages").insert({
      thread_id: threadId,
      empresa_id,
      role: "user",
      content: { text: message },
    });

    // ── Tool executor (read-only, tenant-scoped via service_role + guard) ──
    async function executeTool(name: string, args: any): Promise<string> {
      try {
        if (name === "get_flow_definition") {
          const { data } = await admin
            .from("orbit_flows")
            .select("id, nome, trigger_type, condicoes, ativo")
            .eq("id", args.flow_id)
            .eq("empresa_id", empresa_id)
            .maybeSingle();
          const { data: actions } = await admin
            .from("orbit_flow_actions")
            .select("*")
            .eq("flow_id", args.flow_id)
            .order("ordem");
          return JSON.stringify({ flow: data, actions }).slice(0, 4000);
        }
        if (name === "get_recent_flow_errors") {
          const lim = Math.min(Math.max(Number(args.limit ?? 5), 1), 10);
          const { data } = await admin
            .from("orbit_flow_runs")
            .select("id, status, error, created_at, finished_at")
            .eq("flow_id", args.flow_id)
            .eq("empresa_id", empresa_id)
            .not("error", "is", null)
            .order("created_at", { ascending: false })
            .limit(lim);
          return JSON.stringify(data ?? []).slice(0, 3000);
        }
        if (name === "get_stage_drop_sample") {
          const lim = Math.min(Math.max(Number(args.limit ?? 5), 1), 10);
          const { data } = await admin
            .from("orbit_deals")
            .select("id, titulo, updated_at, etapa_id")
            .eq("empresa_id", empresa_id)
            .eq("etapa_id", args.stage_id)
            .order("updated_at", { ascending: true })
            .limit(lim);
          return JSON.stringify(data ?? []).slice(0, 3000);
        }
        if (name === "get_template_content") {
          const { data } = await admin
            .from("orbit_message_templates")
            .select("id, nome, slug, canal, conteudo")
            .eq("id", args.template_id)
            .eq("empresa_id", empresa_id)
            .maybeSingle();
          return JSON.stringify(data ?? null).slice(0, 3000);
        }
      } catch (e) {
        return JSON.stringify({ error: (e as Error).message });
      }
      return JSON.stringify({ error: "unknown_tool" });
    }

    // ── Loop de tool-calling não-streaming até o modelo entregar texto final,
    //    aí faz o último passo em streaming e repassa para o client.
    let finalStreamResponse: Response | null = null;
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const wantStream = true; // sempre streaming; se vier tool_call, consumimos o SSE p/ extrair
      const upstream = await fetch(LOVABLE_AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages,
          tools: TOOLS,
          stream: wantStream,
        }),
      });

      if (!upstream.ok) {
        const errText = await upstream.text();
        if (upstream.status === 429 || upstream.status === 402) {
          return new Response(JSON.stringify({ ok: false, error: errText, status: upstream.status }), {
            status: upstream.status,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: false, error: errText }), {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      // Consome o SSE, acumula texto e tool_calls
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      const toolCalls: Record<number, { id?: string; name?: string; args: string }> = {};
      let finish = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload);
            const delta = j.choices?.[0]?.delta ?? {};
            if (typeof delta.content === "string") acc += delta.content;
            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                toolCalls[idx] ??= { args: "" };
                if (tc.id) toolCalls[idx].id = tc.id;
                if (tc.function?.name) toolCalls[idx].name = tc.function.name;
                if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
              }
            }
            const fr = j.choices?.[0]?.finish_reason;
            if (fr) finish = fr;
          } catch {}
        }
      }

      const collectedToolCalls = Object.values(toolCalls).filter((t) => t.name);
      if (collectedToolCalls.length > 0) {
        // Append assistant message com tool_calls
        messages.push({
          role: "assistant",
          content: acc || null,
          tool_calls: collectedToolCalls.map((t) => ({
            id: t.id ?? crypto.randomUUID(),
            type: "function",
            function: { name: t.name!, arguments: t.args || "{}" },
          })),
        });
        // Executa e adiciona tool results
        for (const t of collectedToolCalls) {
          let args = {};
          try { args = JSON.parse(t.args || "{}"); } catch {}
          const result = await executeTool(t.name!, args);
          messages.push({
            role: "tool",
            tool_call_id: t.id ?? crypto.randomUUID(),
            content: result,
          });
        }
        continue; // próxima iteração
      }

      // Sem tool_call — resposta final. Já temos o texto em `acc`. Persiste e devolve como SSE simples.
      await admin.from("orbit_advisor_messages").insert({
        thread_id: threadId,
        empresa_id,
        role: "assistant",
        content: { text: acc },
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const meta = { type: "meta", thread_id: threadId };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(meta)}\n\n`));
          // divide em chunks de ~60 chars para dar sensação de streaming ao client
          const chunkSize = 60;
          for (let k = 0; k < acc.length; k += chunkSize) {
            const chunk = { type: "chunk", text: acc.slice(k, k + chunkSize) };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: {"type":"done"}\n\n`));
          controller.close();
        },
      });
      finalStreamResponse = new Response(stream, {
        headers: {
          ...cors,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Advisor-Thread-Id": threadId,
        },
      });
      break;
    }

    if (!finalStreamResponse) {
      return new Response(JSON.stringify({ ok: false, error: "max tool iterations exceeded" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return finalStreamResponse;
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
