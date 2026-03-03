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

    // Buscar prospect first to get empresa_id
    const { data: prospect } = await supabase
      .from("orbit_prospects")
      .select("*")
      .eq("id", prospect_id)
      .single();

    // Determine if demo
    let isDemo = false;
    const empresaId = prospect?.empresa_id;
    if (empresaId) {
      const { data: saasEmpresa } = await supabase
        .from("saas_empresa")
        .select("plan_id, plan:saas_plans(code)")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      const planCode = (saasEmpresa?.plan as any)?.code;
      isDemo = planCode === "demo";
    }

    // Buscar config IA (filtered by empresa_id)
    let aiConfigQuery = supabase.from("orbit_ai_config").select("*");
    if (empresaId) {
      aiConfigQuery = aiConfigQuery.eq("empresa_id", empresaId);
    }
    const { data: aiConfig } = await aiConfigQuery.maybeSingle();

    if (!aiConfig) {
      console.log("[orbit-ai-agent] Config IA não encontrada");
      return new Response(JSON.stringify({ ok: false, error: "AI config not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar horário de atendimento no fuso de São Paulo
    const now = new Date();
    const brasilTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hh = brasilTime.getHours().toString().padStart(2, "0");
    const mm = brasilTime.getMinutes().toString().padStart(2, "0");
    const currentTime = `${hh}:${mm}`;
    const startTime = (aiConfig.horario_inicio || "08:00").substring(0, 5);
    const endTime = (aiConfig.horario_fim || "18:00").substring(0, 5);
    const isWithinHours = currentTime >= startTime && currentTime <= endTime;

    if (!isWithinHours && !aiConfig.responder_fora_horario) {
      if (aiConfig.mensagem_fora_horario) {
        await sendWhatsAppMessage(supabase, telefone, aiConfig.mensagem_fora_horario, conversa_id, isDemo, empresaId);
      }
      return new Response(JSON.stringify({ ok: true, outside_hours: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const mensagensIN = mensagens?.filter((m) => m.direcao === "IN").length || 0;
    const mensagensOUT = mensagens?.filter((m) => m.direcao === "OUT").length || 0;
    const primeiraInteracao = mensagensOUT === 0 || mensagensIN <= 1;

    const aiContexto = conversa?.ai_contexto || {};
    const emColetaOrcamento = aiContexto.em_coleta_orcamento || false;
    const camposColetados = aiContexto.campos_coletados || {};
    const camposCadastro = aiConfig.campos_cadastro || ["nome_razao", "email_principal", "cidade"];
    const maxTokens = aiConfig.max_tokens || 500;
    const idioma = aiConfig.idioma || "pt-BR";
    const promptOrcamentos = aiConfig.prompt_orcamentos || "";

    const camposFaltantes = camposCadastro.filter(
      (campo: string) => !camposColetados[campo] && !prospect?.[campo]
    );
    const cadastroCompleto = camposFaltantes.length === 0;

    const instrucaoOrcamento = promptOrcamentos 
      ? `\nINSTRUÇÃO ESPECIAL PARA ORÇAMENTOS:\n${promptOrcamentos}`
      : "";

    const systemPrompt = `${aiConfig.prompt_treinamento || "Você é um assistente de vendas."}

Tom de voz: ${aiConfig.tom_conversa || "profissional e amigável"}
Idioma: ${idioma === "pt-BR" ? "Português do Brasil" : idioma === "en" ? "Inglês" : "Espanhol"}

REGRAS IMPORTANTES:
1. Se for PRIMEIRA INTERAÇÃO, envie a mensagem de boas-vindas: "${aiConfig.mensagem_boas_vindas || 'Olá! Como posso ajudá-lo?'}"
2. Se o cliente pedir ORÇAMENTO, COTAÇÃO ou demonstrar interesse em comprar, inicie a coleta de dados
3. Se estiver em modo COLETA, peça apenas UM campo por vez de forma natural
4. Quando o cadastro estiver COMPLETO, agradeça e informe que um vendedor especializado entrará em contato
5. NUNCA invente dados sobre produtos ou preços
6. Seja cordial e responda de forma concisa
7. SEMPRE responda no idioma configurado: ${idioma === "pt-BR" ? "Português do Brasil" : idioma === "en" ? "Inglês" : "Espanhol"}
${instrucaoOrcamento}

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
        max_tokens: maxTokens,
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

    // Enviar resposta via WhatsApp (or simulate for demo)
    await sendWhatsAppMessage(supabase, telefone, resposta, conversa_id, isDemo, empresaId);

    return new Response(JSON.stringify({ ok: true, resposta, parsed, simulated: isDemo }), {
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

async function sendWhatsAppMessage(supabase: any, telefone: string, mensagem: string, conversa_id: string, isDemo: boolean, empresaId?: string | null) {
  try {
    if (isDemo) {
      // Demo mode: save message as simulated, don't call Z-API
      console.log("[orbit-ai-agent] Demo mode — simulando envio");
      await supabase.from("orbit_mensagens").insert({
        conversa_id,
        direcao: "OUT",
        mensagem,
        canal: "whatsapp",
        status: "simulated",
        provider_message_id: null,
        empresa_id: empresaId,
      });

      await supabase
        .from("orbit_conversas")
        .update({
          ultima_mensagem_at: new Date().toISOString(),
          ultima_mensagem_preview: mensagem.substring(0, 100),
        })
        .eq("id", conversa_id);
      return;
    }

    // Production mode: call Z-API filtered by empresa_id
    let zapiQuery = supabase
      .from("orbit_zapi_config")
      .select("*")
      .eq("ativo", true);
    if (empresaId) zapiQuery = zapiQuery.eq("empresa_id", empresaId);
    const { data: zapiConfig } = await zapiQuery.maybeSingle();

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

      await supabase.from("orbit_mensagens").insert({
        conversa_id,
        direcao: "OUT",
        mensagem,
        canal: "whatsapp",
        status: response.ok ? "enviada" : "falhou",
        provider_message_id: result.messageId,
        empresa_id: empresaId,
      });

      await supabase
        .from("orbit_conversas")
        .update({
          ultima_mensagem_at: new Date().toISOString(),
          ultima_mensagem_preview: mensagem.substring(0, 100),
        })
        .eq("id", conversa_id);
    } else {
      console.log("[orbit-ai-agent] Z-API não configurado, salvando apenas no banco");
      
      await supabase.from("orbit_mensagens").insert({
        conversa_id,
        direcao: "OUT",
        mensagem,
        canal: "whatsapp",
        status: "pendente",
        empresa_id: empresaId,
      });
    }
  } catch (error) {
    console.error("[orbit-ai-agent] Erro ao enviar WhatsApp:", error);
  }
}
