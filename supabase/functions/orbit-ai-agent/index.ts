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

    // ── LOCK: marcar conversa como em processamento ──
    await supabase
      .from("orbit_conversas")
      .update({ ai_processing: true })
      .eq("id", conversa_id);

    try {
    // ── DEBOUNCE: aguardar 10 segundos para agregar mensagens quebradas ──
    console.log("[orbit-ai-agent] Aguardando 10s para agregar mensagens...");
    await new Promise(r => setTimeout(r, 10000));

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

    // Verificar horário de atendimento no fuso de São Paulo (Intl.DateTimeFormat é confiável no Deno)
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const hh = parts.find(p => p.type === "hour")!.value;
    const mm = parts.find(p => p.type === "minute")!.value;
    const currentTime = `${hh}:${mm}`;
    console.log("[orbit-ai-agent] Horário São Paulo:", currentTime);
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

    // ── AGREGAR: buscar todas as mensagens IN pendentes desde o último OUT ──
    const { data: lastOutMsg } = await supabase
      .from("orbit_mensagens")
      .select("timestamp")
      .eq("conversa_id", conversa_id)
      .eq("direcao", "OUT")
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    let pendingQuery = supabase
      .from("orbit_mensagens")
      .select("mensagem")
      .eq("conversa_id", conversa_id)
      .eq("direcao", "IN")
      .order("timestamp", { ascending: true });

    if (lastOutMsg?.timestamp) {
      pendingQuery = pendingQuery.gt("timestamp", lastOutMsg.timestamp);
    }

    const { data: pendingMsgs } = await pendingQuery;
    const mensagemAgregada = (pendingMsgs && pendingMsgs.length > 0)
      ? pendingMsgs.map(m => m.mensagem).join("\n")
      : mensagem;

    console.log("[orbit-ai-agent] Mensagens agregadas:", pendingMsgs?.length || 1, "msgs →", mensagemAgregada.substring(0, 100));

    // Buscar histórico completo (últimas 20 mensagens para contexto)
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

    // Detect stale prospect (updated more than 90 days ago)
    const isStaleProspect = prospect?.updated_at
      ? (Date.now() - new Date(prospect.updated_at).getTime()) > 90 * 24 * 60 * 60 * 1000
      : false;
    const isReturningContact = !primeiraInteracao || (prospect?.nome_razao && !prospect.nome_razao.startsWith("WhatsApp "));

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
- Telefone: ${prospect?.telefone || "não informado"}
- WhatsApp: ${prospect?.whatsapp || telefone}
- Cidade: ${prospect?.cidade || "não informada"}
- Segmento: ${prospect?.segmento || "não informado"}

IMPORTANTE: Responda em JSON com esta estrutura:
{
  "intencao": "saudacao|orcamento|duvida|reclamacao|agradecimento|falar_humano|outro",
  "mensagem": "sua resposta ao cliente em linguagem natural",
  "iniciar_coleta_orcamento": true|false,
  "dados_extraidos": { "campo": "valor" },
  "campo_solicitado": "nome_do_campo ou null",
  "cadastro_completo": true|false
}

REGRA ADICIONAL: Se o cliente pedir para falar com um vendedor, atendente humano, ou pessoa real, defina "intencao" como "falar_humano" e informe que um vendedor entrará em contato em breve.

REGRA DE ATUALIZAÇÃO CADASTRAL: ${isStaleProspect && isReturningContact ? `O cadastro deste contato está DESATUALIZADO (último update há mais de 90 dias). Após a saudação inicial, pergunte gentilmente se os dados cadastrais ainda estão corretos e se houve alguma mudança (nome, email, cidade, empresa). Campos atuais: Nome=${prospect?.nome_razao}, Email=${prospect?.email_principal || "não informado"}, Cidade=${prospect?.cidade || "não informada"}. Se o cliente confirmar ou fornecer novos dados, extraia-os em "dados_extraidos".` : "Cadastro atualizado, não é necessário solicitar atualização."}`;

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
            content: `Histórico da conversa:\n${historicoFormatado}\n\n---\nMensagens pendentes do cliente: "${mensagemAgregada}"\n\nContexto:\n- Primeira interação: ${primeiraInteracao}\n- Em coleta de dados: ${emColetaOrcamento}\n- Cadastro completo: ${cadastroCompleto}` 
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

    // Distribuir para vendedor com 3 níveis de prioridade
    const FALLBACK_VENDEDOR_ID = "bf42e203-328e-445b-a72d-93529aaedd4d"; // Alexandre Eifler Bock
    let vendedorAtribuido: string | null = null;

    if (parsed.cadastro_completo || parsed.intencao === "falar_humano") {
      if (prospect?.responsavel_id) {
        // 1) Usar responsável já cadastrado no prospect
        vendedorAtribuido = prospect.responsavel_id;
        console.log("[orbit-ai-agent] Usando responsável existente:", vendedorAtribuido);
      } else {
        // 2) Round-robin na fila de distribuição
        const { data: proximoVendedor } = await supabase
          .from("orbit_distribuicao_config")
          .select("vendedor_id")
          .eq("ativo", true)
          .order("ultima_atribuicao", { ascending: true, nullsFirst: true })
          .order("ordem_fila", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (proximoVendedor) {
          vendedorAtribuido = proximoVendedor.vendedor_id;
          await supabase
            .from("orbit_distribuicao_config")
            .update({
              ultima_atribuicao: new Date().toISOString(),
              total_atribuicoes: (await supabase.rpc("increment_atribuicoes", { vendedor: proximoVendedor.vendedor_id })),
            })
            .eq("vendedor_id", proximoVendedor.vendedor_id);
          console.log("[orbit-ai-agent] Lead distribuído via round-robin:", proximoVendedor.vendedor_id);
        } else {
          // 3) Fallback fixo: Alexandre
          vendedorAtribuido = FALLBACK_VENDEDOR_ID;
          console.log("[orbit-ai-agent] Fallback: lead atribuído ao Alexandre:", FALLBACK_VENDEDOR_ID);
        }
      }

      // Atualizar prospect com responsável e qualificar
      if (vendedorAtribuido) {
        await supabase
          .from("orbit_prospects")
          .update({
            responsavel_id: vendedorAtribuido,
            status_qualificacao: "qualificado",
          })
          .eq("id", prospect_id);
      }
    }

    // ── Handoff: notificar vendedor via WhatsApp ──
    const shouldHandoff = parsed.cadastro_completo === true || parsed.intencao === "falar_humano";
    if (shouldHandoff && vendedorAtribuido) {
      await handleSellerHandoff(supabase, {
        conversa_id,
        prospect_id,
        prospect,
        vendedor_id: vendedorAtribuido,
        empresa_id: empresaId,
        mensagem_lead: mensagem,
        telefone_lead: telefone,
        isDemo,
      });
    }

    // Enviar resposta via WhatsApp (or simulate for demo)
    await sendWhatsAppMessage(supabase, telefone, resposta, conversa_id, isDemo, empresaId);

    return new Response(JSON.stringify({ ok: true, resposta, parsed, simulated: isDemo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    } finally {
      // ── UNLOCK: sempre resetar ai_processing ──
      await supabase
        .from("orbit_conversas")
        .update({ ai_processing: false })
        .eq("id", conversa_id);
      console.log("[orbit-ai-agent] Lock liberado para conversa:", conversa_id);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[orbit-ai-agent] Erro:", message);
    // Reset lock on error
    try {
      const supabaseCleanup = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const body = await req.clone().json().catch(() => ({}));
      if (body.conversa_id) {
        await supabaseCleanup.from("orbit_conversas").update({ ai_processing: false }).eq("id", body.conversa_id);
      }
    } catch (_) { /* best effort */ }
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

interface HandoffParams {
  conversa_id: string;
  prospect_id: string;
  prospect: any;
  vendedor_id: string;
  empresa_id: string | null | undefined;
  mensagem_lead: string;
  telefone_lead: string;
  isDemo: boolean;
}

async function handleSellerHandoff(supabase: any, params: HandoffParams) {
  const { conversa_id, prospect_id, prospect, vendedor_id, empresa_id, mensagem_lead, telefone_lead, isDemo } = params;

  try {
    // Check if handoff already sent for this conversa
    const { data: existingHandoff } = await supabase
      .from("orbit_handoffs")
      .select("id")
      .eq("conversa_id", conversa_id)
      .in("status", ["sent", "pending"])
      .maybeSingle();

    if (existingHandoff) {
      console.log("[orbit-ai-agent] Handoff já enviado para esta conversa:", conversa_id);
      return;
    }

    // Get seller data from profiles and pe_users
    const { data: vendedorProfile } = await supabase
      .from("profiles")
      .select("id, nome, telefone, cargo")
      .eq("id", vendedor_id)
      .single();

    const { data: vendedorPe } = await supabase
      .from("pe_users")
      .select("whatsapp, phone")
      .eq("id", vendedor_id)
      .maybeSingle();

    const vendedorWhatsapp = vendedorPe?.whatsapp || vendedorPe?.phone || vendedorProfile?.telefone;
    if (!vendedorWhatsapp) {
      console.log("[orbit-ai-agent] Vendedor sem WhatsApp/telefone, não pode enviar handoff");
      await supabase.from("orbit_handoffs").insert({
        empresa_id,
        conversa_id,
        prospect_id,
        vendedor_id,
        resumo: "Vendedor sem WhatsApp cadastrado",
        status: "failed",
      });
      return;
    }

    // Get empresa name
    let empresaNome = "";
    if (empresa_id) {
      const { data: empresa } = await supabase.from("orbit_empresas").select("nome").eq("id", empresa_id).single();
      empresaNome = empresa?.nome || "";
    }

    // Build summary
    const leadPhone = telefone_lead?.replace(/\D/g, "") || "";
    const vendedorNome = vendedorProfile?.nome || "Vendedor";
    const now = new Date();
    const dataHora = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const msgIntro = empresaNome
      ? `Olá, aqui é ${vendedorNome} da ${empresaNome}. Vi seu contato com nosso atendimento e estou assumindo seu caso por aqui.`
      : `Olá, aqui é ${vendedorNome}. Vi seu contato com nosso atendimento e estou assumindo seu caso por aqui.`;

    const waLink = `https://wa.me/${leadPhone}?text=${encodeURIComponent(msgIntro)}`;

    const resumo = [
      `🔔 *Novo Lead Qualificado pela IA*`,
      ``,
      `👤 Nome: ${prospect?.nome_razao || "Não informado"}`,
      prospect?.nome_fantasia ? `🏢 Empresa: ${prospect.nome_fantasia}` : null,
      `💬 WhatsApp: ${telefone_lead || "Não informado"}`,
      prospect?.cidade ? `📍 Cidade: ${prospect.cidade}${prospect.estado ? `/${prospect.estado}` : ""}` : null,
      prospect?.segmento ? `🏷️ Segmento: ${prospect.segmento}` : null,
      ``,
      prospect?.email_principal ? `📧 Email: ${prospect.email_principal}` : null,
      `💬 Última msg: "${mensagem_lead?.substring(0, 200)}"`,
      `🕐 ${dataHora}`,
      ``,
      `👉 Entrar em contato:`,
      waLink,
    ].filter(Boolean).join("\n");

    // Insert handoff record as pending
    const { data: handoff } = await supabase.from("orbit_handoffs").insert({
      empresa_id,
      conversa_id,
      prospect_id,
      vendedor_id,
      resumo,
      status: "pending",
    }).select().single();

    // Send WhatsApp to seller
    const vendedorPhone = vendedorWhatsapp.replace(/\D/g, "");

    if (isDemo) {
      console.log("[orbit-ai-agent] Demo mode — handoff simulado para vendedor:", vendedorPhone);
      await supabase.from("orbit_handoffs").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", handoff.id);
    } else {
      let zapiQuery = supabase.from("orbit_zapi_config").select("*").eq("ativo", true);
      if (empresa_id) zapiQuery = zapiQuery.eq("empresa_id", empresa_id);
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
            body: JSON.stringify({ phone: vendedorPhone, message: resumo }),
          }
        );

        const result = await response.json();
        console.log("[orbit-ai-agent] Handoff WhatsApp enviado:", { ok: response.ok, messageId: result.messageId });

        await supabase.from("orbit_handoffs").update({
          status: response.ok ? "sent" : "failed",
          sent_at: response.ok ? new Date().toISOString() : null,
        }).eq("id", handoff.id);
      } else {
        console.log("[orbit-ai-agent] Z-API não configurado para handoff");
        await supabase.from("orbit_handoffs").update({ status: "failed" }).eq("id", handoff.id);
      }
    }

    // Update conversa with handoff timestamp
    await supabase.from("orbit_conversas").update({ handoff_sent_at: new Date().toISOString() }).eq("id", conversa_id);
    console.log("[orbit-ai-agent] Handoff completo para conversa:", conversa_id);

  } catch (error) {
    console.error("[orbit-ai-agent] Erro no handoff:", error);
  }
}

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
