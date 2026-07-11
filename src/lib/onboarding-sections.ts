// Onboarding section schema — used by the public wizard, internal preview
// and the implementation-package generator.
//
// The CURRENT schema is the "high-ticket" version (10 sections).
// The LEGACY schema (8 sections) is kept for backwards compatibility so
// old responses still render in the admin detail sheet.

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "url"
  | "select"
  | "multiselect"
  | "number"
  | "asset_list";

export interface OnboardingField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: string[];
  required?: boolean;
  helper?: string;
}

export interface OnboardingSection {
  key: string;
  title: string;
  description: string;
  /** Texto curto, em linguagem de negócio, explicando por que essa seção existe. */
  clientPurpose?: string;
  /** Exemplos concretos para o cliente entender rápido. */
  examples?: string[];
  /** Orientação quando o cliente não souber responder. */
  ifUnsure?: string;
  fields: OnboardingField[];
}

/** Item da lista estruturada de materiais da operação. */
export interface StructuredMaterial {
  tipo: string;
  titulo: string;
  link?: string;
  obs?: string;
}

// ============================================================
// Current schema — High-ticket / Orbit inteligente (10 seções)
// ============================================================
export const ONBOARDING_SECTIONS: OnboardingSection[] = [
  {
    key: "empresa",
    title: "Empresa",
    description: "Quem é o cliente que vamos servir.",
    clientPurpose: "Precisamos dos dados básicos da sua empresa e de quem vai aprovar as decisões da implantação.",
    examples: ["Razão social + nome que aparece pro cliente", "Quem responde por essa implantação no dia a dia"],
    ifUnsure: "Se ainda não tem razão social formal, coloque o nome que você usa comercialmente. A gente ajusta depois.",
    fields: [
      { key: "razao_social", label: "Razão social", type: "text", required: true },
      { key: "nome_fantasia", label: "Nome fantasia", type: "text" },
      { key: "cnpj", label: "Documento (CPF/CNPJ)", type: "text", placeholder: "000.000.000-00 ou 00.000.000/0000-00" },
      { key: "site", label: "Site", type: "url", placeholder: "https://" },
      { key: "segmento", label: "Segmento de atuação", type: "text", required: true },
      { key: "porte", label: "Porte", type: "select", options: ["MEI / Solo", "Até 10 pessoas", "11–50", "51–200", "200+"] },
      { key: "responsavel_nome", label: "Responsável pelo projeto", type: "text", required: true },
      { key: "responsavel_cargo", label: "Cargo do responsável", type: "text" },
      { key: "responsavel_whatsapp", label: "WhatsApp do responsável", type: "text", placeholder: "+55 11 ..." },
    ],
  },
  {
    key: "oferta",
    title: "Oferta e produtos",
    description: "O que vocês vendem, ticket e diferenciais.",
    clientPurpose: "A IA precisa saber o que você vende, por quanto e o que te diferencia — assim ela fala com autoridade.",
    examples: ["\"Consultoria de tributário para indústrias — ticket R$ 25k a R$ 120k\"", "\"Curso online de inglês executivo — mensalidade R$ 397\""],
    ifUnsure: "Fale como você explicaria pra um amigo. Se tem várias ofertas, foca na principal e menciona as secundárias em uma linha.",
    fields: [
      { key: "oferta_principal", label: "Oferta principal (produto/serviço)", type: "textarea", required: true, helper: "Descreva em 2–3 linhas o que é vendido." },
      { key: "ofertas_secundarias", label: "Ofertas secundárias / upsell", type: "textarea" },
      { key: "ticket_medio", label: "Ticket médio (R$)", type: "text", required: true },
      { key: "ticket_alto", label: "Ticket alto / high-ticket (R$)", type: "text", helper: "Se aplicável, o valor de contratos premium." },
      { key: "forma_pagamento", label: "Formas de pagamento aceitas", type: "textarea" },
      { key: "diferenciais", label: "Diferenciais competitivos", type: "textarea", required: true },
      { key: "prova_social", label: "Cases / provas sociais principais", type: "textarea" },
    ],
  },
  {
    key: "icp",
    title: "Lead ideal e qualificação",
    description: "Quem é o cliente ideal e o que qualifica um lead.",
    clientPurpose: "Aqui a gente ensina o CRM a separar lead bom de lead ruim automaticamente — sem depender de humano lendo cada um.",
    examples: ["Priority: 'já tem edital aberto', 'orçamento aprovado', 'decisor no contato'", "Cold: 'estudante', 'só quer preço', 'não é decisor'"],
    ifUnsure: "Pensa nos últimos 5 clientes que fecharam rápido — o que eles tinham em comum? Isso é seu sinal PRIORITY.",
    fields: [
      { key: "cliente_ideal", label: "Descreva seu cliente ideal (ICP)", type: "textarea", required: true, helper: "Setor, porte, cargo decisor, dores típicas." },
      { key: "sinais_priority", label: "Sinais de lead PRIORITY (quente/urgente)", type: "textarea", required: true, helper: "Ex: já tem edital aberto, orçamento aprovado, decisor no contato." },
      { key: "sinais_hot", label: "Sinais de lead HOT (bom fit, sem urgência)", type: "textarea" },
      { key: "sinais_cold", label: "Sinais de lead COLD (descartar/nutrir)", type: "textarea" },
      { key: "motivos_desqualificacao", label: "Motivos claros de desqualificação", type: "textarea" },
      { key: "campos_obrigatorios_lead", label: "Campos obrigatórios que todo lead precisa trazer", type: "textarea", helper: "Ex: nome, whatsapp, empresa, cargo, orçamento." },
    ],
  },
  {
    key: "caminho_lead",
    title: "Caminho do lead",
    description: "Por onde o lead chega até você — e como quer que ele seja recebido.",
    clientPurpose: "Antes de qualquer formulário ou robô, a gente precisa entender por onde o lead entra hoje. Se você não usa Typebot ou formulário, tudo bem — a maioria começa no WhatsApp direto.",
    examples: ["\"O lead me chama direto no WhatsApp depois de ver um anúncio\"", "\"Preenche formulário no site e a gente responde em até 1h\"", "\"Passa por um bot que faz 3 perguntas antes de cair pro humano\""],
    ifUnsure: "Se hoje é só WhatsApp/telefone, marque \"WhatsApp direto\" e descreva como o lead te encontra. Não precisa inventar formulário nenhum.",
    fields: [
      {
        key: "canal_entrada_lead",
        label: "Como o lead entra hoje?",
        type: "select",
        required: true,
        options: [
          "WhatsApp direto",
          "Formulário no site",
          "Typebot / chatbot",
          "Meta Ads / Google Ads",
          "Indicação",
          "Ligação / telefone",
          "Outros / múltiplos",
        ],
        helper: "Escolha o canal principal. Se são vários, escolha \"Outros / múltiplos\" e detalhe abaixo.",
      },
      { key: "descricao_canal", label: "Descreva o caminho atual", type: "textarea", required: true, helper: "Ex: \"anúncio no Instagram → clica no botão de WhatsApp → cai comigo direto\"." },
      { key: "perguntas_captura", label: "Perguntas de captação (opcional)", type: "textarea", helper: "Se você usa formulário ou bot, liste as perguntas — uma por linha. Se não usa, deixe em branco." },
      { key: "qualificacao_inicial", label: "Qualificação inicial no canal (opcional)", type: "textarea", helper: "O que já é filtrado antes de chegar no vendedor humano? Deixe em branco se nada é filtrado." },
      { key: "handoff_humano", label: "Quando passa direto pro humano?", type: "textarea", helper: "Ex: \"sempre\", ou \"só quando o lead pede orçamento\"." },
      { key: "url_captura_atual", label: "URL do formulário/bot atual (se houver)", type: "url" },
    ],
  },
  {
    key: "funil",
    title: "Jornada comercial",
    description: "Etapas do funil, gatilhos e time comercial.",
    clientPurpose: "Precisamos desenhar o funil no CRM igual você trabalha hoje — e depois só otimizar. Nada de forçar processo novo no dia 1.",
    examples: ["Novo lead → Qualificação → Reunião → Proposta → Fechado/Perdido", "Se seu ciclo é rápido: Novo → Contato → Venda"],
    ifUnsure: "Descreva as etapas do jeito que você fala hoje no dia a dia. A gente adapta os nomes depois.",
    fields: [
      { key: "etapas_atuais", label: "Etapas atuais do funil", type: "textarea", required: true, helper: "Na ordem: Novo lead → Qualificação → Reunião → Proposta → Fechado." },
      { key: "gatilhos_avanco", label: "Gatilhos para avançar de etapa", type: "textarea", required: true },
      { key: "motivos_perda", label: "Principais motivos de perda", type: "textarea" },
      { key: "tempo_medio_resposta", label: "Tempo médio de resposta esperado", type: "select", options: ["Imediato", "Até 15 min", "Até 1h", "Mesmo dia", "Próximo dia útil"], required: true },
      { key: "vendedores", label: "Vendedores / SDRs (nome + email)", type: "textarea", required: true, helper: "Um por linha: João Silva — joao@empresa.com" },
      { key: "regras_roteamento", label: "Como leads devem ser distribuídos?", type: "textarea", helper: "Round-robin, por região, por segmento, por score." },
      { key: "horario_atendimento", label: "Horário de atendimento", type: "text", placeholder: "Ex: Seg–Sex, 9h–18h" },
    ],
  },
  {
    key: "ia",
    title: "Agente IA",
    description: "Personalidade e limites do agente que fala com o lead.",
    clientPurpose: "A IA é como um SDR novo entrando no time — precisa de tom de voz, objetivo claro e regras do que NÃO pode falar.",
    examples: ["Tom: \"profissional próximo, sem gírias\"", "Objetivo: \"qualificar e agendar diagnóstico de 30 min\"", "Não pode: \"prometer prazo\", \"dar desconto\", \"falar de concorrente\""],
    ifUnsure: "Pense em como você quer que um vendedor humano recém-contratado se comportasse. Isso é o briefing da IA.",
    fields: [
      { key: "tom_voz", label: "Tom de voz da marca", type: "select", options: ["Formal", "Profissional próximo", "Casual amigável", "Descolado"], required: true },
      { key: "persona_ia", label: "Persona da IA (nome, papel, atitude)", type: "textarea", required: true, helper: "Ex: 'Você é a Marta, consultora sênior da Acme, direta e consultiva.'" },
      { key: "objetivo_ia", label: "Objetivo principal do agente", type: "textarea", required: true, helper: "Ex: qualificar e agendar reunião de diagnóstico." },
      { key: "scripts_proibidos", label: "O que a IA NÃO pode falar/prometer", type: "textarea", required: true },
      { key: "regras_handoff", label: "Quando passar para um humano?", type: "textarea", required: true, helper: "Ex: pedido de desconto, reclamação, lead enterprise." },
      { key: "fora_horario", label: "Mensagem fora do horário comercial", type: "textarea" },
      { key: "conhecimento_extra", label: "Documentos / links que a IA deve conhecer", type: "textarea", helper: "URLs, PDFs, FAQs. Um por linha." },
    ],
  },
  {
    key: "templates",
    title: "Templates e cadência",
    description: "Mensagens-padrão e sequências de follow-up.",
    clientPurpose: "Vamos deixar prontas as mensagens que a IA usa nos primeiros contatos e no follow-up — você aprova antes de subir.",
    examples: ["Primeira abordagem: \"Oi {{nome}}, aqui é a Marta da Acme…\"", "Cadência HOT: D+0, D+1, D+3, D+7"],
    ifUnsure: "Se ainda não tem template pronto, escreva do jeito que você falaria no WhatsApp. A gente ajusta o tom depois.",
    fields: [
      { key: "primeira_abordagem", label: "Mensagem de primeira abordagem (WhatsApp)", type: "textarea", required: true, helper: "Use {{nome}}, {{empresa}} como placeholders." },
      { key: "primeira_abordagem_email", label: "Email de primeira abordagem", type: "textarea" },
      { key: "cadencia_priority", label: "Cadência para lead PRIORITY", type: "textarea", helper: "Ex: D+0 (imediato), D+0+2h, D+1, D+2." },
      { key: "cadencia_hot", label: "Cadência para lead HOT", type: "textarea", helper: "Ex: D+0, D+1, D+3, D+7." },
      { key: "cadencia_cold", label: "Cadência para lead COLD / nutrição", type: "textarea" },
      { key: "cta_padrao", label: "CTA padrão (o que pedir ao lead)", type: "text", placeholder: "Ex: agendar call de 15min" },
      { key: "link_agenda", label: "Link de agendamento (Google Calendar/Cal.com)", type: "url" },
    ],
  },
  {
    key: "midias",
    title: "Mídias e materiais da operação",
    description: "Materiais que o time e a IA podem usar no dia a dia.",
    clientPurpose: "Aqui você lista tudo que já tem pronto — apresentações, cases, vídeos, áudios, PDFs. Serve tanto pra IA aprender quanto pro time enviar pro lead.",
    examples: ["\"Apresentação comercial atualizada em PDF\" — link do Drive", "\"Vídeo de depoimento do cliente X\" — link do YouTube", "\"Áudio de 40s explicando a metodologia\" — descrição"],
    ifUnsure: "Adicione o que você já tem em mão. Não precisa produzir nada novo agora — a lista pode crescer depois.",
    fields: [
      { key: "logo_url", label: "Logo (URL ou drive público)", type: "url" },
      { key: "apresentacao_url", label: "Apresentação comercial (PDF/slides)", type: "url" },
      { key: "cases_url", label: "Cases / depoimentos (link)", type: "url" },
      { key: "videos_url", label: "Vídeos de demo / oferta", type: "textarea", helper: "Um link por linha." },
      { key: "audios", label: "Áudios curtos aprovados para envio", type: "textarea", helper: "Links ou descrição do conteúdo." },
      { key: "assets_extras", label: "Outros materiais relevantes", type: "textarea" },
      {
        key: "materiais_operacao",
        label: "Lista estruturada de materiais",
        type: "asset_list",
        helper: "Cada item tem tipo (PDF, vídeo, áudio, link, imagem…), título, link opcional e observações. Use o botão \"Adicionar material\".",
      },
    ],
  },
  {
    key: "integracoes",
    title: "Integrações",
    description: "O que vamos conectar para a operação rodar.",
    clientPurpose: "Aqui a gente lista os canais e ferramentas que precisamos conectar — WhatsApp, email, calendário, etc.",
    examples: ["Número WhatsApp comercial + provedor (Z-API, Meta oficial)", "Email de envio já verificado no seu domínio", "Google Calendar do vendedor pra agendamento"],
    ifUnsure: "Se algum canal ainda não existe, deixe em branco — na call de kick-off a gente decide como configurar.",
    fields: [
      { key: "whatsapp_numero", label: "Número WhatsApp comercial", type: "text", placeholder: "+55 11 ...", required: true },
      { key: "whatsapp_provider", label: "Provedor WhatsApp atual", type: "select", options: ["Z-API", "Oficial Meta", "Outro", "Nenhum"] },
      { key: "email_dominio", label: "Domínio de envio de email", type: "text", placeholder: "envio.seudominio.com.br" },
      { key: "calendar_email", label: "Email do Google Calendar para agendamentos", type: "email" },
      { key: "fontes_lead", label: "Fontes de lead que você usa hoje", type: "textarea" },
      { key: "ferramentas_atuais", label: "Ferramentas atuais (CRM, planilhas, etc.)", type: "textarea" },
      { key: "webhooks_desejados", label: "Webhooks / integrações desejadas", type: "textarea", helper: "Ex: enviar leads para Notion, Slack, ERP X." },
    ],
  },
  {
    key: "go_live",
    title: "Go-live",
    description: "Últimos detalhes para a virada.",
    clientPurpose: "Alinhamento final: quem aprova, quando queremos virar e o que vamos medir como sucesso.",
    examples: ["Data desejada + responsável final que aprova o disparo", "Critérios: '20 reuniões agendadas no primeiro mês', 'tempo de resposta < 1h'"],
    ifUnsure: "Sem data fechada? Combina uma janela (\"segunda quinzena de X\"). Sobre critérios, use o que você já mede hoje.",
    fields: [
      { key: "responsavel_final", label: "Responsável final pela aprovação", type: "text", required: true },
      { key: "data_desejada", label: "Data desejada para go-live", type: "text", placeholder: "DD/MM/AAAA" },
      { key: "pendencias", label: "Pendências ou bloqueios conhecidos", type: "textarea" },
      { key: "criterios_sucesso", label: "Critérios de sucesso nos primeiros 30 dias", type: "textarea", helper: "Ex: 20 reuniões agendadas, X% de resposta." },
      { key: "observacoes", label: "Observações finais", type: "textarea" },
    ],
  },
];

// ============================================================
// Legacy schema (MVP 8 seções) — mantido apenas para renderizar
// respostas antigas no admin.
// ============================================================
export const LEGACY_ONBOARDING_SECTIONS: OnboardingSection[] = [
  {
    key: "equipe",
    title: "[Legado] Equipe & distribuição",
    description: "Respostas antigas do MVP.",
    fields: [
      { key: "vendedores", label: "Vendedores/SDRs", type: "textarea" },
      { key: "regras_roteamento", label: "Regras de roteamento", type: "textarea" },
      { key: "metas", label: "Metas", type: "textarea" },
      { key: "horario_atendimento", label: "Horário de atendimento", type: "text" },
    ],
  },
];

/** Seções conhecidas (atuais + legado) — usado no admin para exibir respostas antigas. */
export const ALL_KNOWN_SECTIONS: OnboardingSection[] = [
  ...ONBOARDING_SECTIONS,
  ...LEGACY_ONBOARDING_SECTIONS,
];

// ============================================================
// Progresso e checklist
// ============================================================

export function calculateProgress(responses: Record<string, any>): number {
  const requiredFields = ONBOARDING_SECTIONS.flatMap((s) =>
    s.fields.filter((f) => f.required).map((f) => ({ section: s.key, key: f.key }))
  );
  const pool = requiredFields.length > 0
    ? requiredFields
    : ONBOARDING_SECTIONS.flatMap((s) => s.fields.map((f) => ({ section: s.key, key: f.key })));
  if (pool.length === 0) return 0;
  let filled = 0;
  for (const { section, key } of pool) {
    if (hasVal(responses, section, key)) filled++;
  }
  return Math.round((filled / pool.length) * 100);
}

export const DEFAULT_CHECKLIST = [
  { key: "zapi", label: "Conectar Z-API e validar número WhatsApp", done: false },
  { key: "resend", label: "Configurar Resend e domínio de envio", done: false },
  { key: "leads", label: "Importar base inicial de leads", done: false },
  { key: "funil", label: "Configurar funil e etapas", done: false },
  { key: "ia", label: "Treinar IA com tom de voz e regras", done: false },
  { key: "templates", label: "Cadastrar templates de mensagem aprovados", done: false },
  { key: "calendar", label: "Validar calendário Google", done: false },
  { key: "kickoff", label: "Agendar call de kick-off", done: false },
];

// ============================================================
// Helpers de leitura
// ============================================================

type FieldRef = { section: string; field: string };

const RESPONSE_ALIASES: Record<string, FieldRef[]> = {
  "empresa.razao_social": [
    { section: "empresa", field: "nome_empresa" },
    { section: "empresa", field: "nome_publico" },
  ],
  "empresa.responsavel_nome": [
    { section: "empresa", field: "responsavel_aprovacao" },
  ],
  "oferta.oferta_principal": [
    { section: "oferta", field: "oferta_principal_descricao" },
    { section: "oferta", field: "oferta_principal_nome" },
    { section: "oferta", field: "promessa_central" },
  ],
  "oferta.ticket_medio": [
    { section: "oferta", field: "ticket_principal" },
    { section: "icp", field: "ticket_medio" },
  ],
  "oferta.diferenciais": [
    { section: "icp", field: "diferenciais" },
    { section: "oferta", field: "resultado_esperado" },
  ],
  "icp.cliente_ideal": [
    { section: "qualificacao", field: "lead_ideal" },
    { section: "oferta", field: "para_quem_e" },
  ],
  "icp.sinais_priority": [
    { section: "qualificacao", field: "sinais_urgencia" },
    { section: "qualificacao", field: "sinais_fit_forte" },
    { section: "qualificacao", field: "faixas_high" },
  ],
  "icp.sinais_hot": [
    { section: "qualificacao", field: "faixas_medium" },
    { section: "qualificacao", field: "sinais_nutricao" },
  ],
  "icp.sinais_cold": [
    { section: "qualificacao", field: "faixas_low" },
    { section: "qualificacao", field: "lead_ruim" },
  ],
  "caminho_lead.canal_entrada_lead": [
    { section: "formulario", field: "canal_captura" },
    { section: "lead_form", field: "typebot_link" },
    { section: "jornada", field: "origem_leads" },
    { section: "integracoes", field: "fontes_lead" },
  ],
  "caminho_lead.descricao_canal": [
    { section: "formulario", field: "canal_captura" },
    { section: "jornada", field: "origem_leads" },
  ],
  "caminho_lead.perguntas_captura": [
    { section: "formulario", field: "campos_typebot" },
    { section: "lead_form", field: "perguntas_formulario" },
    { section: "lead_form", field: "variaveis_typebot" },
    { section: "qualificacao", field: "perguntas_obrigatorias_antes_call" },
  ],
  "caminho_lead.qualificacao_inicial": [
    { section: "formulario", field: "qualificacao_no_bot" },
    { section: "qualificacao", field: "criterio_principal_qualificacao" },
  ],
  "caminho_lead.handoff_humano": [
    { section: "formulario", field: "handoff_bot" },
  ],
  "caminho_lead.url_captura_atual": [
    { section: "formulario", field: "url_formulario_atual" },
  ],
  "funil.gatilhos_avanco": [
    { section: "funil", field: "criterios_qualificacao" },
    { section: "jornada", field: "quando_chamar_call" },
  ],
  "funil.vendedores": [
    { section: "equipe", field: "vendedores" },
    { section: "jornada", field: "quem_faz_call" },
  ],
  "ia.persona_ia": [
    { section: "ia", field: "agente_fala_como_quem" },
  ],
  "ia.objetivo_ia": [
    { section: "jornada", field: "primeiro_contato_desejado" },
    { section: "ia", field: "como_convidar_call" },
  ],
  "ia.scripts_proibidos": [
    { section: "ia", field: "frases_proibidas" },
    { section: "qualificacao", field: "promessas_proibidas" },
  ],
  "ia.regras_handoff": [
    { section: "ia", field: "quando_transferir_humano" },
  ],
  "ia.conhecimento_extra": [
    { section: "ativos", field: "materiais_treinamento" },
    { section: "ativos", field: "link_pasta_materiais" },
  ],
  "templates.primeira_abordagem": [
    { section: "templates", field: "template_primeiro_contato" },
    { section: "templates", field: "template_convite_call" },
  ],
  "templates.cadencia_priority": [
    { section: "templates", field: "cadencia_followup_high" },
  ],
  "templates.cadencia_hot": [
    { section: "templates", field: "cadencia_followup_medium" },
  ],
  "templates.cadencia_cold": [
    { section: "templates", field: "cadencia_followup_low" },
  ],
  "midias.logo_url": [
    { section: "ativos", field: "link_pasta_materiais" },
  ],
  "midias.apresentacao_url": [
    { section: "ativos", field: "materiais_treinamento" },
  ],
  "midias.cases_url": [
    { section: "ativos", field: "provas_sociais_disponiveis" },
  ],
  "midias.videos_url": [
    { section: "ativos", field: "videos_disponiveis" },
  ],
  "midias.audios": [
    { section: "ativos", field: "audios_disponiveis" },
  ],
  "midias.assets_extras": [
    { section: "ativos", field: "assets_extras" },
  ],
  "integracoes.email_dominio": [
    { section: "integracoes", field: "dominio_email" },
    { section: "integracoes", field: "email_envio" },
  ],
  "go_live.responsavel_final": [
    { section: "go_live", field: "responsavel_aprovacao_final" },
    { section: "empresa", field: "responsavel_aprovacao" },
  ],
  "go_live.data_desejada": [
    { section: "go_live", field: "data_desejada_go_live" },
  ],
  "go_live.criterios_sucesso": [
    { section: "go_live", field: "criterios_go_live" },
  ],
};

function rawVal(responses: Record<string, any>, section: string, field: string): any {
  return responses?.[section]?.[field];
}

function isFilled(v: any): boolean {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.some(isFilled);
  if (typeof v === "object") return Object.values(v).some(isFilled);
  return String(v).trim() !== "";
}

function getVal(responses: Record<string, any>, section: string, field: string): string {
  const refs = [{ section, field }, ...(RESPONSE_ALIASES[`${section}.${field}`] ?? [])];
  for (const ref of refs) {
    const v = rawVal(responses, ref.section, ref.field);
    if (isFilled(v)) return Array.isArray(v) ? v.join("\n") : String(v).trim();
  }
  return "";
}

function hasVal(responses: Record<string, any>, section: string, field: string): boolean {
  return getVal(responses, section, field) !== "";
}

/** Campos required não preenchidos, agrupados por seção. */
export function getMissingRequiredFields(
  responses: Record<string, any>,
): { section: string; label: string; field: string }[] {
  const out: { section: string; label: string; field: string }[] = [];
  for (const sec of ONBOARDING_SECTIONS) {
    for (const f of sec.fields) {
      if (!f.required) continue;
      if (!hasVal(responses, sec.key, f.key)) {
        out.push({ section: sec.title, label: f.label, field: `${sec.key}.${f.key}` });
      }
    }
  }
  return out;
}

// ============================================================
// buildImplementationProfile — perfil sintético do tenant
// ============================================================

export interface ImplementationProfile {
  empresa: {
    razao_social: string;
    nome_fantasia: string;
    segmento: string;
    porte: string;
    responsavel: string;
    site: string;
  };
  oferta: {
    principal: string;
    ticket_medio: string;
    ticket_alto: string;
    high_ticket: boolean;
    diferenciais: string;
  };
  icp: {
    resumo: string;
    priority_signals: string[];
    hot_signals: string[];
    cold_signals: string[];
  };
  ia: {
    tom: string;
    persona: string;
    objetivo: string;
    proibicoes: string;
    handoff: string;
  };
  integracoes: {
    whatsapp_numero: string;
    whatsapp_provider: string;
    calendar_email: string;
    email_dominio: string;
  };
  lead_entry: {
    canal: string;
    descricao: string;
    perguntas: string[];
    qualificacao_inicial: string;
    handoff: string;
    url_captura: string;
    uses_typebot: boolean;
  };
  assets: {
    structured_materials: StructuredMaterial[];
  };
  go_live: {
    responsavel_final: string;
    data_desejada: string;
    criterios_sucesso: string;
  };
}

function splitLines(v: string): string[] {
  return v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function parseCurrency(v: string): number {
  if (!v) return 0;
  const cleaned = v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export function buildImplementationProfile(
  responses: Record<string, any>,
): ImplementationProfile {
  const ticketMedio = getVal(responses, "oferta", "ticket_medio");
  const ticketAlto = getVal(responses, "oferta", "ticket_alto");
  const highTicket =
    parseCurrency(ticketAlto) >= 5000 || parseCurrency(ticketMedio) >= 5000;

  return {
    empresa: {
      razao_social: getVal(responses, "empresa", "razao_social"),
      nome_fantasia: getVal(responses, "empresa", "nome_fantasia"),
      segmento: getVal(responses, "empresa", "segmento"),
      porte: getVal(responses, "empresa", "porte"),
      responsavel: getVal(responses, "empresa", "responsavel_nome"),
      site: getVal(responses, "empresa", "site"),
    },
    oferta: {
      principal: getVal(responses, "oferta", "oferta_principal"),
      ticket_medio: ticketMedio,
      ticket_alto: ticketAlto,
      high_ticket: highTicket,
      diferenciais: getVal(responses, "oferta", "diferenciais"),
    },
    icp: {
      resumo: getVal(responses, "icp", "cliente_ideal"),
      priority_signals: splitLines(getVal(responses, "icp", "sinais_priority")),
      hot_signals: splitLines(getVal(responses, "icp", "sinais_hot")),
      cold_signals: splitLines(getVal(responses, "icp", "sinais_cold")),
    },
    ia: {
      tom: getVal(responses, "ia", "tom_voz"),
      persona: getVal(responses, "ia", "persona_ia"),
      objetivo: getVal(responses, "ia", "objetivo_ia"),
      proibicoes: getVal(responses, "ia", "scripts_proibidos"),
      handoff: getVal(responses, "ia", "regras_handoff"),
    },
    integracoes: {
      whatsapp_numero: getVal(responses, "integracoes", "whatsapp_numero"),
      whatsapp_provider: getVal(responses, "integracoes", "whatsapp_provider"),
      calendar_email: getVal(responses, "integracoes", "calendar_email"),
      email_dominio: getVal(responses, "integracoes", "email_dominio"),
    },
    lead_entry: {
      canal: getVal(responses, "caminho_lead", "canal_entrada_lead"),
      descricao: getVal(responses, "caminho_lead", "descricao_canal"),
      perguntas: splitLines(getVal(responses, "caminho_lead", "perguntas_captura")),
      qualificacao_inicial: getVal(responses, "caminho_lead", "qualificacao_inicial"),
      handoff: getVal(responses, "caminho_lead", "handoff_humano"),
      url_captura: getVal(responses, "caminho_lead", "url_captura_atual"),
      uses_typebot: /typebot|chatbot|bot/i.test(
        getVal(responses, "caminho_lead", "canal_entrada_lead") +
          " " +
          getVal(responses, "caminho_lead", "descricao_canal"),
      ),
    },
    assets: {
      structured_materials: readStructuredMaterials(responses),
    },
    go_live: {
      responsavel_final: getVal(responses, "go_live", "responsavel_final"),
      data_desejada: getVal(responses, "go_live", "data_desejada"),
      criterios_sucesso: getVal(responses, "go_live", "criterios_sucesso"),
    },
  };
}

/** Lê a lista estruturada de materiais aceitando array direto ou fallback vazio. */
function readStructuredMaterials(responses: Record<string, any>): StructuredMaterial[] {
  const raw = responses?.midias?.materiais_operacao;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({
      tipo: String(r?.tipo ?? "").trim(),
      titulo: String(r?.titulo ?? "").trim(),
      link: r?.link ? String(r.link).trim() : undefined,
      obs: r?.obs ? String(r.obs).trim() : undefined,
    }))
    .filter((m) => m.tipo || m.titulo || m.link || m.obs);
}

// ============================================================
// buildRecommendedTypebotBody — corpo de captação recomendado
// (funciona para Typebot, formulário simples ou script humano)
// ============================================================

export function buildRecommendedTypebotBody(
  responses: Record<string, any>,
): string {
  const perguntas = splitLines(getVal(responses, "caminho_lead", "perguntas_captura"));
  const canal = getVal(responses, "caminho_lead", "canal_entrada_lead");
  const descricaoCanal = getVal(responses, "caminho_lead", "descricao_canal");
  const empresa = getVal(responses, "empresa", "nome_fantasia") ||
    getVal(responses, "empresa", "razao_social") || "sua empresa";
  const oferta = getVal(responses, "oferta", "oferta_principal") || "nossa solução";
  const camposObrig = splitLines(getVal(responses, "icp", "campos_obrigatorios_lead"));
  const handoff = getVal(responses, "caminho_lead", "handoff_humano");
  const usesTypebot = /typebot|chatbot|bot/i.test(canal + " " + descricaoCanal);

  const baseline = perguntas.length
    ? perguntas
    : [
        "Qual é o seu nome?",
        "Qual o melhor WhatsApp para contato?",
        "Qual é a empresa e o seu cargo?",
        "Qual o principal desafio hoje que te trouxe até aqui?",
        "Em quanto tempo você precisa resolver isso?",
      ];

  const linhas: string[] = [];
  linhas.push(`// Body de captação recomendado — ${empresa}`);
  linhas.push(`// Canal principal: ${canal || "não informado"}`);
  linhas.push(`// Modo: ${usesTypebot ? "Typebot / chatbot" : "WhatsApp direto ou formulário simples"}`);
  linhas.push(`// Objetivo: qualificar leads para "${oferta}"`);
  linhas.push("");
  linhas.push(`Introdução:`);
  linhas.push(
    `"Oi! Aqui é a ${empresa}. Vou fazer perguntas rápidas para entender seu momento e te encaminhar pro time certo."`,
  );
  linhas.push("");
  linhas.push("Perguntas:");
  baseline.forEach((q, i) => linhas.push(`${i + 1}. ${q}`));

  if (camposObrig.length) {
    linhas.push("");
    linhas.push("Campos obrigatórios antes de encerrar:");
    for (const c of camposObrig) linhas.push(`- ${c}`);
  }

  linhas.push("");
  linhas.push("Regras de encerramento:");
  linhas.push(
    `- Enviar todos os campos para /orbit-lead-ingest com source_slug=${usesTypebot ? "typebot" : "captacao"}.`,
  );
  linhas.push("- Marcar utm_source, utm_medium, utm_campaign quando presentes.");
  if (handoff) {
    linhas.push("- Handoff imediato se: " + handoff.replace(/\n+/g, " · "));
  }

  return linhas.join("\n");
}

// ============================================================
// buildImplementationPackageMarkdown
// ============================================================

export interface ImplementationPackageParams {
  onboarding: {
    id?: string;
    cliente_nome?: string | null;
    cliente_email?: string | null;
    cliente_empresa?: string | null;
    status?: string;
    responses?: Record<string, any> | null;
    empresa?: { nome?: string | null; slug?: string | null } | null;
  };
  checklist: { key: string; label: string; done?: boolean }[];
  publicLink: string;
}

function block(title: string, lines: string[]): string[] {
  return ["", `## ${title}`, "", ...lines];
}

export function buildImplementationPackageMarkdown(
  params: ImplementationPackageParams,
): string {
  const { onboarding, checklist, publicLink } = params;
  const responses = (onboarding.responses ?? {}) as Record<string, any>;
  const profile = buildImplementationProfile(responses);
  const missing = getMissingRequiredFields(responses);
  const empresa = onboarding.empresa?.nome ?? onboarding.cliente_empresa ?? "—";
  const slug = onboarding.empresa?.slug ? `/${onboarding.empresa.slug}` : "";
  const progress = calculateProgress(responses);

  const out: string[] = [];
  out.push(`# Pacote de implantação — ${empresa}${slug}`);
  out.push("");
  out.push(`> Gerado em ${new Date().toISOString()} · Progresso ${progress}%`);
  out.push("");

  // Dados do cliente
  out.push("## Dados do cliente");
  out.push("");
  out.push(`- **Empresa:** ${empresa}${slug}`);
  out.push(`- **Contato:** ${onboarding.cliente_nome ?? "—"} (${onboarding.cliente_email ?? "—"})`);
  out.push(`- **Segmento:** ${profile.empresa.segmento || "—"}`);
  out.push(`- **Porte:** ${profile.empresa.porte || "—"}`);
  out.push(`- **Site:** ${profile.empresa.site || "—"}`);
  out.push(`- **Status:** ${onboarding.status ?? "—"}`);
  out.push(`- **Wizard:** ${publicLink}`);

  // Campos faltantes
  out.push(...block(
    "Campos faltantes",
    missing.length
      ? missing.map((m) => `- [ ] **${m.section} · ${m.label}** (\`${m.field}\`)`)
      : ["_Todos os campos obrigatórios preenchidos._"],
  ));

  // Implementation profile
  out.push(...block("Implementation profile", [
    "```json",
    JSON.stringify(profile, null, 2),
    "```",
  ]));

  // Body de captação recomendado
  out.push(...block("Body de captação recomendado", [
    "```text",
    buildRecommendedTypebotBody(responses),
    "```",
  ]));

  // Treinamento inicial do agente
  out.push(...block("Treinamento inicial do agente", [
    `- **Tom de voz:** ${profile.ia.tom || "—"}`,
    `- **Persona:** ${profile.ia.persona || "—"}`,
    `- **Objetivo:** ${profile.ia.objetivo || "—"}`,
    "",
    "**Restrições (o que a IA NÃO pode fazer):**",
    profile.ia.proibicoes ? indent(profile.ia.proibicoes) : "_(não definido)_",
    "",
    "**Regras de handoff:**",
    profile.ia.handoff ? indent(profile.ia.handoff) : "_(não definido)_",
    "",
    "**Conhecimento extra a ingerir na base RAG:**",
    indent(getVal(responses, "ia", "conhecimento_extra") || "_(nenhum)_"),
  ]));

  // Templates em rascunho
  const primeiraWa = getVal(responses, "templates", "primeira_abordagem");
  const primeiraEmail = getVal(responses, "templates", "primeira_abordagem_email");
  out.push(...block("Templates em rascunho", [
    "### WhatsApp · primeira abordagem",
    "```text",
    primeiraWa || "(preencher)",
    "```",
    "",
    "### Email · primeira abordagem",
    "```text",
    primeiraEmail || "(preencher)",
    "```",
    "",
    `**CTA padrão:** ${getVal(responses, "templates", "cta_padrao") || "—"}`,
    `**Link de agenda:** ${getVal(responses, "templates", "link_agenda") || "—"}`,
  ]));

  // Fluxos sugeridos
  const cadPrio = getVal(responses, "templates", "cadencia_priority");
  const cadHot = getVal(responses, "templates", "cadencia_hot");
  const cadCold = getVal(responses, "templates", "cadencia_cold");
  out.push(...block("Fluxos sugeridos", [
    "- **[ORBIT] Novo lead PRIORITY** — resposta imediata + follow-up curto.",
    "  Cadência: " + (cadPrio || "D+0 imediato · D+0+2h · D+1 · D+2"),
    "- **[ORBIT] Novo lead HOT** — nutrição comercial padrão.",
    "  Cadência: " + (cadHot || "D+0 · D+1 · D+3 · D+7"),
    "- **[ORBIT] Nutrição COLD** — sequência educativa longa.",
    "  Cadência: " + (cadCold || "D+0 · D+7 · D+14 · D+30"),
    "- Todas as ações devem começar com `dry_run:true` e `cancel_on_reply:true`.",
  ]));

  // Lead Score sugerido
  out.push(...block("Lead Score sugerido", [
    "**Priority (score >= 80):**",
    ...(profile.icp.priority_signals.length
      ? profile.icp.priority_signals.map((s) => `- ${s}`)
      : ["- (definir com o cliente)"]),
    "",
    "**Hot (score 50–79):**",
    ...(profile.icp.hot_signals.length
      ? profile.icp.hot_signals.map((s) => `- ${s}`)
      : ["- (definir)"]),
    "",
    "**Cold (score < 50 / desqualificar):**",
    ...(profile.icp.cold_signals.length
      ? profile.icp.cold_signals.map((s) => `- ${s}`)
      : ["- (definir)"]),
  ]));

  // Ativos e mídias
  out.push(...block("Ativos e mídias", [
    `- **Logo:** ${getVal(responses, "midias", "logo_url") || "—"}`,
    `- **Apresentação comercial:** ${getVal(responses, "midias", "apresentacao_url") || "—"}`,
    `- **Cases:** ${getVal(responses, "midias", "cases_url") || "—"}`,
    "",
    "**Vídeos:**",
    indent(getVal(responses, "midias", "videos_url") || "—"),
    "",
    "**Áudios:**",
    indent(getVal(responses, "midias", "audios") || "—"),
    "",
    "**Outros:**",
    indent(getVal(responses, "midias", "assets_extras") || "—"),
  ]));

  // Smoke plan
  out.push(...block("Smoke plan", [
    "1. Rodar `orbit-lead-ingest` com 3 leads sintéticos (Low, Medium, High) via `source_slug` do Typebot.",
    "2. Validar Lead Score em cada caso (cold/hot/priority) e o `meta.lead_score` da resposta.",
    "3. Confirmar disparo dos fluxos correspondentes com `dry_run:true`.",
    "4. Conferir agendamento de `orbit_flow_scheduled_actions` (D+1, D+3, etc.).",
    "5. Simular resposta inbound e validar cancelamento automático da cadência.",
    "6. Rodar `orbit-onboarding-create` com `dry_run_email:true` para testar o link sem enviar email real.",
    "7. Cleanup: arquivar prospects/onboardings sintéticos ao final.",
  ]));

  // Checklist
  out.push(...block("Checklist de implementação", checklist.map(
    (c) => `- [${c.done ? "x" : " "}] ${c.label}`,
  )));

  // Guardrails
  out.push(...block("Guardrails", [
    "- **Isolamento por tenant:** toda operação filtra por `empresa_id`. Não usar service role em rotas client-side.",
    "- **RLS:** nenhuma tabela `public.*` sai sem policy + GRANT explícito.",
    "- **Z-API:** validar conectividade antes do go-live; alertas ativos no advisor.",
    "- **Email (Resend):** validar domínio verificado antes do primeiro disparo real.",
    "- **Fluxos:** subir sempre com `dry_run:true` em ambiente de teste e `cancel_on_reply:true`.",
    "- **Lead Score:** overrides usam apenas valores escalares (helper `_lead_score_jsonb_values`), nunca chaves.",
    "- **Advisor:** aplicar mudanças só quando `advisor_playbook_gate` liberar (Z-API + Calendário + prefixos ok).",
    "- **Secrets:** nunca commitar; usar `add_secret` no Lovable Cloud.",
  ]));

  out.push("");
  return out.join("\n");
}

function indent(s: string): string {
  return s.split(/\r?\n/).map((l) => (l.trim() ? `  ${l}` : l)).join("\n");
}
