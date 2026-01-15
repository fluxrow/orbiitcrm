import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversa_id, prospect_id, mensagem, telefone } = await req.json();
    console.log("[orbit-ai-agent] Processando:", { conversa_id, prospect_id, mensagem: mensagem?.substring(0, 50) });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar config IA
    const { data: aiConfig } = await supabase
      .from("orbit_ai_config")
      .select("*")
      .maybeSingle();

    if (!aiConfig) {
      console.log("[orbit-ai-agent] Config IA não encontrada");
      return new Response(JSON.stringify({ ok: false, error: "AI config not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar horário de atendimento
    const now = new Date();
    const currentTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
    const startTime = aiConfig.horario_inicio || "08:00";
    const endTime = aiConfig.horario_fim || "18:00";
    const isWithinHours = currentTime >= startTime && currentTime <= endTime;

    if (!isWithinHours && !aiConfig.responder_fora_horario) {
      // Enviar mensagem de fora de horário
      if (aiConfig.mensagem_fora_horario) {
        await sendWhatsAppMessage(supabase, telefone, aiConfig.mensagem_fora_horario, conversa_id);
      }
      return new Response(JSON.stringify({ ok: true, outside_hours: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar prospect
    const { data: prospect } = await supabase
      .from("orbit_prospects")
      .select("*")
      .eq("id", prospect_id)
      .single();

    // Buscar conversa com contexto
    const { data: conversa } = await supabase
      .from("orbit_conversas")
      .select("*")
      .eq("id", conversa_id)
      .single();

    // Buscar histórico
    const { data: mensagens } = await supabase
      .from("orbit_mensagens")
      .select("direcao, mensagem, timestamp")
      .eq("conversa_id", conversa_id)
      .order("timestamp", { ascending: false })
      .limit(20);

    const historicoFormatado = (mensagens || [])
      .reverse()
      .map((m) => `${m.direcao === "IN" ? "Cliente" : "Assistente"}: ${m.mensagem}`)
      .join("\n");

    // Determinar se é primeira interação
    const mensagensIN = mensagens?.filter((m) => m.direcao === "IN").length || 0;
    const mensagensOUT = mensagens?.filter((m) => m.direcao === "OUT").length || 0;
    const primeiraInteracao = mensagensOUT === 0 || mensagensIN <= 1;

    // Contexto da conversa
    const aiContexto = conversa?.ai_contexto || {};
    const emColetaOrcamento = aiContexto.em_coleta_orcamento || false;
    const camposColetados = aiContexto.campos_coletados || {};
    const camposCadastro = aiConfig.campos_cadastro || ["nome_razao", "email_principal", "cidade"];

    // Verificar quais campos faltam
    const camposFaltantes = camposCadastro.filter(
      (campo: string) => !camposColetados[campo] && !prospect?.[campo]
    );
    const cadastroCompleto = camposFaltantes.length === 0;

    // Montar prompt do sistema
    const systemPrompt = `${aiConfig.prompt_treinamento || "Você é um assistente de vendas."}

Tom de voz: ${aiConfig.tom_conversa || "profissional e amigável"}

REGRAS IMPORTANTES:
1. Se for PRIMEIRA INTERAÇÃO, envie a mensagem de boas-vindas: "${aiConfig.mensagem_boas_vindas || 'Olá! Como posso ajudá-lo?'}"
2. Se o cliente pedir ORÇAMENTO, COTAÇÃO ou demonstrar interesse em comprar, inicie a coleta de dados
3. Se estiver em modo COLETA, peça apenas UM campo por vez de forma natural
4. Quando o cadastro estiver COMPLETO, agradeça e informe que um vendedor especializado entrará em contato
5. NUNCA invente dados sobre produtos ou preços
6. Seja cordial e responda de forma concisa

Campos necessários para qualificação: ${camposCadastro.join(", ")}
Campos já coletados: ${JSON.stringify(camposColetados)}
Campos faltantes: ${camposFaltantes.join(", ") || "nenhum - cadastro completo"}

Dados do prospect:
- Nome: ${prospect?.nome_razao || "não informado"}
- Email: ${prospect?.email_principal || "não informado"}
- Telefone: ${prospect?.telefone_whatsapp || telefone}
- Cidade: ${prospect?.cidade || "não informada"}
- Segmento: ${prospect?.segmento || "não informado"}

IMPORTANTE: Responda em JSON com esta estrutura:
{
  "intencao": "saudacao|orcamento|duvida|reclamacao|agradecimento|outro",
  "mensagem": "sua resposta ao cliente em linguagem natural",
  "iniciar_coleta_orcamento": true|false,
  "dados_extraidos": { "campo": "valor" },
  "campo_solicitado": "nome_do_campo ou null",
  "cadastro_completo": true|false
}`;

    // Chamar Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: `Histórico da conversa:\n${historicoFormatado}\n\n---\nÚltima mensagem do cliente: "${mensagem}"\n\nContexto:\n- Primeira interação: ${primeiraInteracao}\n- Em coleta de dados: ${emColetaOrcamento}\n- Cadastro completo: ${cadastroCompleto}` 
          },
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[orbit-ai-agent] AI Gateway error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parsear resposta JSON
    let parsed: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { mensagem: content };
    } catch {
      parsed = { mensagem: content };
    }

    const resposta = parsed.mensagem || content;
    console.log("[orbit-ai-agent] Resposta gerada:", resposta.substring(0, 100));

    // Atualizar contexto da conversa
    const novoContexto = {
      ...aiContexto,
      em_coleta_orcamento: parsed.iniciar_coleta_orcamento || emColetaOrcamento,
      campos_coletados: { ...camposColetados, ...parsed.dados_extraidos },
      cadastro_completo: parsed.cadastro_completo,
      ultima_intencao: parsed.intencao,
    };

    await supabase
      .from("orbit_conversas")
      .update({ ai_contexto: novoContexto })
      .eq("id", conversa_id);

    // Atualizar prospect com dados extraídos
    if (parsed.dados_extraidos && Object.keys(parsed.dados_extraidos).length > 0) {
      await supabase
        .from("orbit_prospects")
        .update(parsed.dados_extraidos)
        .eq("id", prospect_id);
    }

    // Se cadastro completo, distribuir para vendedor
    if (parsed.cadastro_completo && !prospect?.responsavel_id) {
      // Buscar próximo vendedor da fila (round-robin)
      const { data: proximoVendedor } = await supabase
        .from("orbit_distribuicao_config")
        .select("vendedor_id")
        .eq("ativo", true)
        .order("ultima_atribuicao", { ascending: true, nullsFirst: true })
        .order("ordem_fila", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (proximoVendedor) {
        await supabase
          .from("orbit_prospects")
          .update({
            responsavel_id: proximoVendedor.vendedor_id,
            status_qualificacao: "qualificado",
          })
          .eq("id", prospect_id);

        await supabase
          .from("orbit_distribuicao_config")
          .update({
            ultima_atribuicao: new Date().toISOString(),
            total_atribuicoes: (await supabase.rpc("increment_atribuicoes", { vendedor: proximoVendedor.vendedor_id })),
          })
          .eq("vendedor_id", proximoVendedor.vendedor_id);

        console.log("[orbit-ai-agent] Lead distribuído para:", proximoVendedor.vendedor_id);
      }
    }

    // Enviar resposta via WhatsApp
    await sendWhatsAppMessage(supabase, telefone, resposta, conversa_id);

    return new Response(JSON.stringify({ ok: true, resposta, parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[orbit-ai-agent] Erro:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function sendWhatsAppMessage(supabase: any, telefone: string, mensagem: string, conversa_id: string) {
  try {
    // Buscar config Z-API
    const { data: zapiConfig } = await supabase
      .from("orbit_zapi_config")
      .select("*")
      .eq("ativo", true)
      .maybeSingle();

    if (zapiConfig?.instance_id && zapiConfig?.token) {
      const response = await fetch(
        `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-text`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Client-Token": zapiConfig.client_token || "",
          },
          body: JSON.stringify({
            phone: telefone,
            message: mensagem,
          }),
        }
      );

      const result = await response.json();
      console.log("[orbit-ai-agent] WhatsApp enviado:", result);

      // Salvar mensagem enviada
      await supabase.from("orbit_mensagens").insert({
        conversa_id,
        direcao: "OUT",
        mensagem: mensagem,
        canal: "whatsapp",
        status: response.ok ? "enviada" : "falhou",
        provider_message_id: result.messageId,
      });

      // Atualizar preview da conversa
      await supabase
        .from("orbit_conversas")
        .update({
          ultima_mensagem_at: new Date().toISOString(),
          ultima_mensagem_preview: mensagem.substring(0, 100),
        })
        .eq("id", conversa_id);
    } else {
      console.log("[orbit-ai-agent] Z-API não configurado, salvando apenas no banco");
      
      // Salvar mensagem mesmo sem Z-API (para testes)
      await supabase.from("orbit_mensagens").insert({
        conversa_id,
        direcao: "OUT",
        mensagem: mensagem,
        canal: "whatsapp",
        status: "pendente",
      });
    }
  } catch (error) {
    console.error("[orbit-ai-agent] Erro ao enviar WhatsApp:", error);
  }
}
