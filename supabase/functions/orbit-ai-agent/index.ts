import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getOrbitZapiRuntimeConfig } from "../_shared/orbit-zapi.ts";

// ── Estado da conversa (máquina de estados) ──
type ConversationState = "novo" | "aguardando_resposta" | "auto_reply_detected" | "human_detected" | "qualificando" | "qualificado" | "handoff" | "encerrado";

// ── Classificação de mensagem ──
type MessageClassification = "human_probable" | "auto_reply" | "uncertain";

interface LeadContext {
  lead: {
    id: string;
    personName: string | null;
    contactName: string | null;
    companyName: string | null;
    city: string | null;
    email: string | null;
    demandType: string | null;
    isRecurring: boolean | null;
    status: string | null;
    source: string | null;
    owner: string | null;
  };
  conversation: {
    origin: "outbound_campaign" | "inbound";
    state: ConversationState;
    isFirstInteraction: boolean;
    introAlreadySent: boolean;
  };
  missingFields: Record<string, boolean>;
}

// ── Validação de dados extraídos ──
function validateExtractedData(dados: Record<string, any>): Record<string, any> {
  const validated: Record<string, any> = {};

  for (const [campo, valor] of Object.entries(dados)) {
    if (valor === null || valor === undefined || String(valor).trim() === "") continue;

    const strVal = String(valor).trim();

    switch (campo) {
      case "email_principal":
        if (strVal.includes("@") && strVal.includes(".")) {
          validated[campo] = strVal.toLowerCase();
        } else {
          console.log(`[orbit-ai-agent] Email inválido descartado: ${strVal}`);
        }
        break;

      case "nome_fantasia": {
        // Heurística: empresa não deve ser nome de pessoa simples (2 palavras curtas sem maiúsculas internas)
        const words = strVal.split(/\s+/);
        const looksLikePersonName = words.length === 2 && words.every(w => w.length <= 10 && /^[A-ZÀ-Ú][a-zà-ú]+$/.test(w));
        if (looksLikePersonName) {
          console.log(`[orbit-ai-agent] Nome de empresa parece nome de pessoa, descartado: ${strVal}`);
        } else {
          validated[campo] = strVal;
        }
        break;
      }

      case "cidade":
        // Cidade não deve conter números
        if (/\d/.test(strVal)) {
          console.log(`[orbit-ai-agent] Cidade com números descartada: ${strVal}`);
        } else {
          validated[campo] = strVal;
        }
        break;

      default:
        validated[campo] = strVal;
        break;
    }
  }

  return validated;
}

// ── Classificar mensagem como humana, automática ou incerta ──
async function classifyMessage(mensagem: string): Promise<{ classification: MessageClassification; confidence: number }> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Classifique esta mensagem de WhatsApp recebida em resposta a uma campanha comercial.
Categorias:
- auto_reply: mensagem automática, institucional, menu de opções, horário de atendimento, "mensagem automática", "assistente virtual", "em instantes responderemos", "seja bem-vindo à empresa X", "digite 1, 2, 3", recepção automática
- human_probable: saudação real (oi, olá, bom dia), pergunta contextual (quem fala, do que se trata), resposta natural (sim, sou eu, pode falar, eu cuido), demonstração de atenção/interesse
- uncertain: muito vaga, sem evidência suficiente (ok, ?, ., alô)

Responda APENAS com JSON: {"classification": "...", "confidence": 0.0-1.0}`
          },
          { role: "user", content: `Mensagem: "${mensagem}"` }
        ],
        temperature: 0.1,
        max_tokens: 50,
      }),
    });

    if (!response.ok) {
      console.error("[orbit-ai-agent] Erro na classificação:", response.status);
      return { classification: "uncertain", confidence: 0.5 };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const cls = parsed.classification;
      if (cls === "human_probable" || cls === "auto_reply" || cls === "uncertain") {
        return { classification: cls, confidence: parsed.confidence || 0.5 };
      }
    }
    return { classification: "uncertain", confidence: 0.5 };
  } catch (err) {
    console.error("[orbit-ai-agent] Erro classificação:", err);
    return { classification: "uncertain", confidence: 0.5 };
  }
}

// ── Notificar comercial sobre interação humana detectada ──
async function notifyCommercialHumanDetected(
  supabase: any,
  params: {
    prospect: any;
    telefone_lead: string;
    mensagem: string;
    classification: MessageClassification;
    empresa_id: string | null;
    isDemo: boolean;
  }
) {
  const { prospect, telefone_lead, mensagem, classification, empresa_id, isDemo } = params;
  const FALLBACK_VENDEDOR_ID = "bf42e203-328e-445b-a72d-93529aaedd4d";
  
  // Determinar vendedor a notificar
  const vendedorId = prospect?.responsavel_id || FALLBACK_VENDEDOR_ID;
  
  const { data: vendedorProfile } = await supabase
    .from("profiles")
    .select("id, nome, telefone")
    .eq("id", vendedorId)
    .single();

  const { data: vendedorPe } = await supabase
    .from("pe_users")
    .select("whatsapp, phone")
    .eq("id", vendedorId)
    .maybeSingle();

  const vendedorWhatsapp = vendedorPe?.whatsapp || vendedorPe?.phone || vendedorProfile?.telefone;
  if (!vendedorWhatsapp) {
    console.log("[orbit-ai-agent] Vendedor sem WhatsApp para notificação comercial");
    return;
  }

  const leadPhone = telefone_lead?.replace(/\D/g, "") || "";
  const waLink = `https://wa.me/${leadPhone}`;
  const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  // Helper to get display name
  const getDisplayName = (p: any): string => {
    const nome = p?.nome_razao || "";
    const digits = nome.replace(/\D/g, "");
    const isPhone = /^\d{8,}$/.test(digits) && digits.length >= 8;
    const isPlaceholder = nome.startsWith("WhatsApp ");
    return (isPhone || isPlaceholder) ? (p?.nome_fantasia || "Não informado") : (nome || "Não informado");
  };

  const notificacao = [
    `🟢 *Novo sinal de interação humana detectado*`,
    ``,
    `👤 Prospect: ${getDisplayName(prospect)}`,
    `📱 Telefone: ${telefone_lead || "Não informado"}`,
    prospect?.nome_fantasia ? `🏢 Empresa: ${prospect.nome_fantasia}` : null,
    `💬 Mensagem: "${mensagem?.substring(0, 200)}"`,
    `🏷️ Classificação: ${classification}`,
    `📊 Status: possível interesse inicial`,
    `🕐 ${dataHora}`,
    ``,
    `👉 Conversa: ${waLink}`,
  ].filter(Boolean).join("\n");

  const vendedorPhone = vendedorWhatsapp.replace(/\D/g, "");

  if (isDemo) {
    console.log("[orbit-ai-agent] Demo — notificação comercial simulada:", vendedorPhone);
    return;
  }

  const zapiConfig = await getOrbitZapiRuntimeConfig(supabase, empresa_id);

  if (zapiConfig?.instance_id && zapiConfig?.token) {
    const response = await fetch(
      `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": zapiConfig.client_token || "",
        },
        body: JSON.stringify({ phone: vendedorPhone, message: notificacao }),
      }
    );
    console.log("[orbit-ai-agent] Notificação comercial enviada:", response.ok);
  }
}

// ── Calcular próximo estado da conversa ──
function computeNextState(
  currentState: ConversationState,
  intencao: string,
  cadastroCompleto: boolean,
  isHandoff: boolean,
  messageClassification?: MessageClassification
): ConversationState {
  if (isHandoff) return "handoff";
  if (cadastroCompleto) return "qualificado";
  if (intencao === "falar_humano") return "handoff";
  
  // Transições baseadas em classificação de mensagem
  if (messageClassification === "auto_reply" && (currentState === "aguardando_resposta" || currentState === "novo")) {
    return "auto_reply_detected";
  }
  if (messageClassification === "human_probable" && (currentState === "aguardando_resposta" || currentState === "novo" || currentState === "auto_reply_detected")) {
    return "human_detected";
  }
  
  if (currentState === "human_detected") return "qualificando";
  if (currentState === "aguardando_resposta" || currentState === "novo") return "qualificando";
  if (currentState === "qualificando" && cadastroCompleto) return "qualificado";
  return currentState === "novo" ? "qualificando" : currentState;
}

// ── Montar leadContext estruturado ──
function buildLeadContext(
  prospect: any,
  conversa: any,
  aiContexto: any,
  camposFaltantes: string[],
  primeiraInteracao: boolean
): LeadContext {
  const isFromCampaign = aiContexto.origin === "outbound_campaign";
  const introAlreadySent = aiContexto.intro_already_sent === true;
  const currentState: ConversationState = aiContexto.estado || "novo";

  const missingFields: Record<string, boolean> = {};
  const fieldMap: Record<string, string> = {
    nome_fantasia: "companyName",
    nome_contato: "contactName",
    cidade: "city",
    email_principal: "email",
    segmento: "demandType",
  };

  for (const campo of camposFaltantes) {
    const key = fieldMap[campo] || campo;
    missingFields[key] = true;
  }

  // isRecurring vem do ai_contexto
  if (aiContexto.is_recurring === null || aiContexto.is_recurring === undefined) {
    missingFields["isRecurring"] = true;
  }

  return {
    lead: {
      id: prospect?.id || "",
      personName: prospect?.nome_razao || null,
      contactName: prospect?.nome_contato || null,
      companyName: prospect?.nome_fantasia || null,
      city: prospect?.cidade || null,
      email: prospect?.email_principal || null,
      demandType: prospect?.segmento || null,
      isRecurring: aiContexto.is_recurring ?? null,
      status: prospect?.status_qualificacao || null,
      source: prospect?.origem_contato || null,
      owner: prospect?.responsavel_id || null,
    },
    conversation: {
      origin: isFromCampaign ? "outbound_campaign" : "inbound",
      state: currentState,
      isFirstInteraction: primeiraInteracao,
      introAlreadySent: introAlreadySent,
    },
    missingFields,
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

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

    // Verificar horário de atendimento no fuso de São Paulo
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

    // ── CLASSIFICAR MENSAGEM: humana, automática ou incerta ──
    const { classification: msgClassification, confidence: msgConfidence } = await classifyMessage(mensagemAgregada);
    console.log("[orbit-ai-agent] Classificação:", msgClassification, "confiança:", msgConfidence);

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
    const aiContexto = conversa?.ai_contexto || {};
    const introAlreadySent = aiContexto.intro_already_sent === true;
    const isFromCampaign = aiContexto.origin === "outbound_campaign";
    const primeiraInteracao = !introAlreadySent && (mensagensOUT === 0 || mensagensIN <= 1);

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

    // ── Montar contexto estruturado do lead ──
    const leadContext = buildLeadContext(prospect, conversa, aiContexto, camposFaltantes, primeiraInteracao);
    console.log("[orbit-ai-agent] LeadContext:", JSON.stringify(leadContext.conversation), "missing:", Object.keys(leadContext.missingFields));

    // Detect stale prospect (updated more than 90 days ago)
    const isStaleProspect = prospect?.updated_at
      ? (Date.now() - new Date(prospect.updated_at).getTime()) > 90 * 24 * 60 * 60 * 1000
      : false;
    const isReturningContact = !primeiraInteracao || (prospect?.nome_razao && !prospect.nome_razao.startsWith("WhatsApp "));

    const instrucaoOrcamento = promptOrcamentos 
      ? `\nINSTRUÇÃO ESPECIAL PARA ORÇAMENTOS:\n${promptOrcamentos}`
      : "";

    // ── Prompt refatorado com contexto estruturado ──
    const campaignContinuity = isFromCampaign
      ? `\nREGRA DE CAMPANHA: Esta conversa foi iniciada por uma campanha outbound. O prospect já recebeu uma mensagem nossa. NÃO envie boas-vindas novamente. NÃO se reapresente. Considere o histórico e continue a conversa do ponto atual.`
      : "";

    const stateInstruction = (() => {
      switch (leadContext.conversation.state) {
        case "aguardando_resposta":
          return "\nESTADO: Campanha enviada, aguardando resposta. Continue de onde parou.";
        case "auto_reply_detected":
          return "\nESTADO: Resposta automática detectada. Tente contornar a automação e alcançar a pessoa responsável. Pergunte diretamente pela pessoa que cuida de viagens corporativas ou compras.";
        case "human_detected":
          return "\nESTADO: Interação humana detectada. Siga a qualificação normalmente, sem mencionar a detecção.";
        case "qualificando":
          return "\nESTADO: Em qualificação. Colete apenas os campos faltantes listados abaixo.";
        case "qualificado":
          return "\nESTADO: Lead qualificado. Informe que um vendedor especializado entrará em contato.";
        case "handoff":
          return "\nESTADO: Já houve handoff. Se o lead ainda interagir, informe que o responsável entrará em contato em breve.";
        default:
          return "";
      }
    })();

    // Instrução sobre classificação da mensagem recebida
    const classificationInstruction = msgClassification === "auto_reply"
      ? `\nCLASSIFICAÇÃO DA MENSAGEM RECEBIDA: RESPOSTA AUTOMÁTICA. Esta mensagem foi enviada por um sistema automático/bot. Tente contornar educadamente e perguntar pela pessoa responsável por viagens corporativas ou compras. NÃO trate como interesse real.`
      : msgClassification === "human_probable"
      ? `\nCLASSIFICAÇÃO DA MENSAGEM RECEBIDA: INTERAÇÃO HUMANA. Continue a qualificação normalmente.`
      : "";

    const systemPrompt = `${aiConfig.prompt_treinamento || "Você é um assistente de vendas."}

Tom de voz: ${aiConfig.tom_conversa || "profissional e amigável"}
Idioma: ${idioma === "pt-BR" ? "Português do Brasil" : idioma === "en" ? "Inglês" : "Espanhol"}
${campaignContinuity}${stateInstruction}${classificationInstruction}

CONTEXTO ESTRUTURADO DO LEAD:
${JSON.stringify(leadContext, null, 2)}

REGRAS CRÍTICAS:
1. DADOS EXISTENTES: Se um dado do lead já está preenchido no contexto acima (personName, companyName, city, email, etc.), NUNCA pergunte novamente. Use naturalmente na conversa.
2. CAMPOS FALTANTES: Solicite APENAS os campos marcados como "true" em missingFields. Siga esta ordem de prioridade:
   a) Identificar se é demanda corporativa
   b) companyName (empresa)
   c) city (cidade)
   d) email
   e) isRecurring (recorrência)
   Pule os que já estão preenchidos.
3. Se for PRIMEIRA INTERAÇÃO (isFirstInteraction=true) E NÃO for campanha, envie a mensagem de boas-vindas: "${aiConfig.mensagem_boas_vindas || 'Olá! Como posso ajudá-lo?'}"
4. Se o cliente pedir ORÇAMENTO, COTAÇÃO ou demonstrar interesse em comprar, inicie a coleta dos campos faltantes.
5. Quando TODOS os campos estiverem preenchidos, agradeça e informe: "Perfeito. Vou colocar o Alexandre aqui para avançarmos de forma mais objetiva."
6. NUNCA invente dados sobre produtos ou preços.
7. Seja cordial e responda de forma concisa — máximo 2-3 frases.
8. SEMPRE responda no idioma configurado.
9. Se precisar CONFIRMAR um dado antigo ou possivelmente desatualizado, use confirmação leve: "Segue sendo pela [empresa], certo?" — nunca reinicie a coleta.
10. NUNCA resetar conversa. NUNCA reapresentar-se se já houve interação anterior.
11. Se o cliente pedir para falar com um vendedor, atendente humano ou pessoa real, defina "intencao" como "falar_humano".
${instrucaoOrcamento}

REGRA DE ATUALIZAÇÃO CADASTRAL: ${isStaleProspect && isReturningContact ? `O cadastro está DESATUALIZADO (>90 dias). Após a saudação, pergunte gentilmente se os dados ainda estão corretos. Se confirmar ou fornecer novos dados, extraia-os em "dados_extraidos".` : "Cadastro atualizado, não solicitar atualização."}

IMPORTANTE: Responda em JSON com esta estrutura:
{
  "intencao": "saudacao|orcamento|duvida|reclamacao|agradecimento|falar_humano|outro",
  "mensagem": "sua resposta ao cliente em linguagem natural",
  "iniciar_coleta_orcamento": true|false,
  "dados_extraidos": { "campo_do_banco": "valor" },
  "campo_solicitado": "nome_do_campo ou null",
  "cadastro_completo": true|false
}

Mapeamento de campos para dados_extraidos:
- Nome da empresa → "nome_fantasia"
- Cidade → "cidade"
- Email → "email_principal"
- Segmento/tipo de demanda → "segmento"
- Nome da pessoa de contato → "nome_contato"
- Nome/razão social → "nome_razao"`;

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
            content: `Histórico da conversa:\n${historicoFormatado}\n\n---\nMensagens pendentes do cliente: "${mensagemAgregada}"\n\nContexto:\n- Estado: ${leadContext.conversation.state}\n- Primeira interação: ${primeiraInteracao}\n- Em coleta de dados: ${emColetaOrcamento}\n- Cadastro completo: ${cadastroCompleto}\n- Campos faltantes: ${camposFaltantes.join(", ") || "nenhum"}` 
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

    // ── Validar dados extraídos antes de salvar ──
    const dadosValidados = parsed.dados_extraidos 
      ? validateExtractedData(parsed.dados_extraidos) 
      : {};

    // ── Calcular próximo estado da conversa ──
    const isHandoff = parsed.cadastro_completo === true || parsed.intencao === "falar_humano";
    const nextState = computeNextState(
      leadContext.conversation.state,
      parsed.intencao || "outro",
      parsed.cadastro_completo || false,
      false, // handoff será determinado abaixo
      msgClassification
    );

    // ── Notificação comercial no primeiro sinal humano ──
    const alreadyNotified = aiContexto.commercial_notified === true;
    if (msgClassification === "human_probable" && !alreadyNotified) {
      console.log("[orbit-ai-agent] Primeiro sinal humano detectado, notificando comercial...");
      await notifyCommercialHumanDetected(supabase, {
        prospect,
        telefone_lead: telefone,
        mensagem: mensagemAgregada,
        classification: msgClassification,
        empresa_id: empresaId || null,
        isDemo,
      });
    }

    // Atualizar contexto da conversa com estado e classificação
    const novoContexto = {
      ...aiContexto,
      estado: isHandoff ? "handoff" : nextState,
      em_coleta_orcamento: parsed.iniciar_coleta_orcamento || emColetaOrcamento,
      campos_coletados: { ...camposColetados, ...dadosValidados },
      cadastro_completo: parsed.cadastro_completo,
      ultima_intencao: parsed.intencao,
      intro_already_sent: introAlreadySent || primeiraInteracao,
      // Campos de classificação
      message_classification: msgClassification,
      human_detected: aiContexto.human_detected || msgClassification === "human_probable",
      auto_reply_detected: aiContexto.auto_reply_detected || msgClassification === "auto_reply",
      commercial_notified: alreadyNotified || msgClassification === "human_probable",
      first_human_response_at: (!aiContexto.first_human_response_at && msgClassification === "human_probable")
        ? new Date().toISOString()
        : aiContexto.first_human_response_at || null,
    };

    await supabase
      .from("orbit_conversas")
      .update({ ai_contexto: novoContexto })
      .eq("id", conversa_id);

    // Atualizar prospect com dados validados (nunca sobrescrever dados confirmados)
    if (Object.keys(dadosValidados).length > 0) {
      // Filtrar: só atualizar campos que estão vazios no prospect
      const updateData: Record<string, any> = {};
      for (const [campo, valor] of Object.entries(dadosValidados)) {
        const currentValue = prospect?.[campo];
        if (!currentValue || currentValue === "" || currentValue.startsWith("WhatsApp ")) {
          updateData[campo] = valor;
        } else {
          console.log(`[orbit-ai-agent] Campo ${campo} já preenchido (${currentValue}), não sobrescrevendo com: ${valor}`);
        }
      }

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from("orbit_prospects")
          .update(updateData)
          .eq("id", prospect_id);
        console.log("[orbit-ai-agent] Prospect atualizado com:", Object.keys(updateData));
      }
    }

    // Distribuir para vendedor com 3 níveis de prioridade
    const FALLBACK_VENDEDOR_ID = "bf42e203-328e-445b-a72d-93529aaedd4d"; // Alexandre Eifler Bock
    let vendedorAtribuido: string | null = null;

    if (isHandoff) {
      if (prospect?.responsavel_id) {
        vendedorAtribuido = prospect.responsavel_id;
        console.log("[orbit-ai-agent] Usando responsável existente:", vendedorAtribuido);
      } else {
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
          vendedorAtribuido = FALLBACK_VENDEDOR_ID;
          console.log("[orbit-ai-agent] Fallback: lead atribuído ao Alexandre:", FALLBACK_VENDEDOR_ID);
        }
      }

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
    if (isHandoff && vendedorAtribuido) {
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

    // Enviar resposta via WhatsApp
    await sendWhatsAppMessage(supabase, telefone, resposta, conversa_id, isDemo, empresaId);

    return new Response(JSON.stringify({ ok: true, resposta, parsed, state: novoContexto.estado, simulated: isDemo }), {
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

// ── Helper functions ──

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

    let empresaNome = "";
    if (empresa_id) {
      const { data: empresa } = await supabase.from("orbit_empresas").select("nome").eq("id", empresa_id).single();
      empresaNome = empresa?.nome || "";
    }

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

    const { data: handoff } = await supabase.from("orbit_handoffs").insert({
      empresa_id,
      conversa_id,
      prospect_id,
      vendedor_id,
      resumo,
      status: "pending",
    }).select().single();

    const vendedorPhone = vendedorWhatsapp.replace(/\D/g, "");

    if (isDemo) {
      console.log("[orbit-ai-agent] Demo mode — handoff simulado para vendedor:", vendedorPhone);
      await supabase.from("orbit_handoffs").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", handoff.id);
    } else {
      const zapiConfig = await getOrbitZapiRuntimeConfig(supabase, empresa_id);

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

    await supabase.from("orbit_conversas").update({ handoff_sent_at: new Date().toISOString() }).eq("id", conversa_id);
    console.log("[orbit-ai-agent] Handoff completo para conversa:", conversa_id);

  } catch (error) {
    console.error("[orbit-ai-agent] Erro no handoff:", error);
  }
}

async function sendWhatsAppMessage(supabase: any, telefone: string, mensagem: string, conversa_id: string, isDemo: boolean, empresaId?: string | null) {
  try {
    if (isDemo) {
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

    const zapiConfig = await getOrbitZapiRuntimeConfig(supabase, empresaId);

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
