import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, corsOptionsResponse } from "../_shared/cors.ts";
import { callAnthropic, toAnthropicMessages, ANTHROPIC_DEFAULT_MODEL } from "../_shared/anthropic.ts";

interface SandboxMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface SandboxAIConfig {
  prompt_identidade?: string;
  prompt_roteiro?: string;
  prompt_regras?: string;
  tom_conversa?: string;
  idioma?: string;
  max_tokens?: number;
  campos_qualificacao?: Array<{ label?: string; key?: string; required?: boolean }>;
}

interface MockLead {
  nome?: string;
  origem?: string;
  telefone?: string;
  email?: string;
  cidade?: string;
  segmento?: string;
  observacoes?: string;
}

interface SandboxRequest {
  aiConfig?: SandboxAIConfig;
  messages?: SandboxMessage[];
  mockLead?: MockLead | null;
  trigger?: "inbound_webhook" | "manual" | "follow_up";
}

function buildSystemPrompt(cfg: SandboxAIConfig, mockLead?: MockLead | null, trigger?: string): string {
  const identidade = (cfg.prompt_identidade && cfg.prompt_identidade.trim())
    || "Você é um(a) SDR profissional, consultivo(a) e direto(a), atendendo via WhatsApp.";
  const roteiro = (cfg.prompt_roteiro && cfg.prompt_roteiro.trim()) || "";
  const regras = (cfg.prompt_regras && cfg.prompt_regras.trim()) || "";
  const tom = cfg.tom_conversa || "profissional";
  const idioma = cfg.idioma || "pt-BR";

  const camposQ = (cfg.campos_qualificacao || [])
    .map((c) => `- ${c.label || c.key}${c.required ? " (obrigatório)" : ""}`)
    .join("\n");

  const leadCtx = mockLead
    ? `\n=== CONTEXTO DO LEAD (SIMULADO) ===\n` +
      `Nome: ${mockLead.nome ?? "não informado"}\n` +
      `Origem: ${mockLead.origem ?? "não informada"}\n` +
      `Telefone: ${mockLead.telefone ?? "não informado"}\n` +
      `Email: ${mockLead.email ?? "não informado"}\n` +
      `Cidade: ${mockLead.cidade ?? "não informada"}\n` +
      `Segmento: ${mockLead.segmento ?? "não informado"}\n` +
      `Observações: ${mockLead.observacoes ?? "—"}\n` +
      `=== FIM ===\n`
    : "";

  const triggerCtx = trigger === "inbound_webhook"
    ? `\n=== GATILHO ===\nO lead acabou de entrar via formulário/webhook. Inicie a conversa com uma mensagem de abordagem curta, personalizada e que abra espaço para resposta. Não envie blocos longos. Faça UMA pergunta por mensagem.\n=== FIM ===\n`
    : "";

  return [
    `[AMBIENTE DE TESTE / SANDBOX — sem persistência]`,
    identidade,
    `Tom: ${tom}. Idioma: ${idioma}.`,
    roteiro ? `\n=== ROTEIRO ===\n${roteiro}\n=== FIM ===` : "",
    camposQ ? `\n=== CAMPOS A QUALIFICAR ===\n${camposQ}\n=== FIM ===` : "",
    leadCtx,
    triggerCtx,
    regras ? `\n=== REGRAS INVIOLÁVEIS ===\n${regras}\n=== FIM ===` : "",
    `\nResponda como mensagens curtas de WhatsApp. Uma ideia por mensagem.`,
  ].filter(Boolean).join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsOptionsResponse(req);
  const cors = getCorsHeaders(req);

  try {
    const body = (await req.json()) as SandboxRequest;
    const aiConfig = body.aiConfig ?? {};
    const inMessages = Array.isArray(body.messages) ? body.messages : [];
    const mockLead = body.mockLead ?? null;
    const trigger = body.trigger;

    const systemPrompt = buildSystemPrompt(aiConfig, mockLead, trigger);

    // Turnos do usuário/assistente que vão no campo messages da Anthropic.
    const turns: Array<{ role: string; content: string }> = [...inMessages];

    if (trigger === "inbound_webhook" && inMessages.length === 0) {
      turns.push({
        role: "user",
        content: "[SISTEMA] Gere agora a PRIMEIRA mensagem de abordagem ao lead recém-chegado, usando os dados do contexto. Apenas a mensagem final, sem comentários.",
      });
    }

    const result = await callAnthropic({
      model: ANTHROPIC_DEFAULT_MODEL,
      system: systemPrompt,
      messages: toAnthropicMessages(turns),
      temperature: 0.7,
      max_tokens: aiConfig.max_tokens || 500,
    });

    if (!result.ok) {
      if (result.code === "rate_limit") {
        return new Response(JSON.stringify({ ok: false, error: "Limite de taxa excedido. Tente novamente em instantes." }), {
          status: 429, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (result.code === "credits") {
        return new Response(JSON.stringify({ ok: false, error: "Saldo/uso da conta Anthropic insuficiente." }), {
          status: 402, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: false, error: result.error }), {
        status: result.code === "missing_key" || result.code === "auth" ? 500 : 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const message: string = result.text || "(sem resposta)";

    return new Response(JSON.stringify({ ok: true, data: { message } }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
