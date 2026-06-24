// Onboarding section schema — used by the public wizard and internal preview.

export type FieldType = "text" | "textarea" | "email" | "url" | "select" | "multiselect" | "number";

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
  fields: OnboardingField[];
}

export const ONBOARDING_SECTIONS: OnboardingSection[] = [
  {
    key: "empresa",
    title: "Sua empresa",
    description: "Quem é o cliente que vamos servir.",
    fields: [
      { key: "razao_social", label: "Razão social", type: "text", required: true },
      { key: "nome_fantasia", label: "Nome fantasia", type: "text" },
      { key: "cnpj", label: "CNPJ", type: "text", placeholder: "00.000.000/0000-00" },
      { key: "site", label: "Site", type: "url", placeholder: "https://" },
      { key: "segmento", label: "Segmento de atuação", type: "text", required: true },
      { key: "porte", label: "Porte", type: "select", options: ["MEI / Solo", "Até 10 pessoas", "11–50", "51–200", "200+"] },
      { key: "responsavel_nome", label: "Responsável pelo projeto", type: "text", required: true },
      { key: "responsavel_cargo", label: "Cargo do responsável", type: "text" },
    ],
  },
  {
    key: "icp",
    title: "ICP & posicionamento",
    description: "Quem é o cliente ideal e como vocês se posicionam.",
    fields: [
      { key: "cliente_ideal", label: "Descreva seu cliente ideal", type: "textarea", required: true, helper: "Setor, porte, cargo decisor, dores típicas." },
      { key: "ticket_medio", label: "Ticket médio (R$)", type: "text" },
      { key: "ciclo_venda", label: "Ciclo médio de venda", type: "select", options: ["Imediato (até 7 dias)", "Curto (até 30 dias)", "Médio (30–90 dias)", "Longo (90+ dias)"] },
      { key: "principais_dores", label: "Top 3 dores que vocês resolvem", type: "textarea", required: true },
      { key: "diferenciais", label: "Diferenciais competitivos", type: "textarea" },
      { key: "concorrentes", label: "Principais concorrentes", type: "textarea" },
    ],
  },
  {
    key: "funil",
    title: "Funil & processo comercial",
    description: "Como leads avançam até virar cliente.",
    fields: [
      { key: "etapas_atuais", label: "Etapas atuais do funil", type: "textarea", required: true, helper: "Liste na ordem, ex: Novo lead → Qualificação → Proposta → Fechado." },
      { key: "criterios_qualificacao", label: "Critérios para qualificar um lead", type: "textarea", required: true },
      { key: "gatilhos_avanco", label: "O que faz um lead avançar de etapa?", type: "textarea" },
      { key: "motivos_perda", label: "Principais motivos de perda", type: "textarea" },
      { key: "tempo_medio_resposta", label: "Tempo médio de resposta esperado", type: "select", options: ["Imediato", "Até 15 min", "Até 1h", "Mesmo dia", "Próximo dia útil"] },
    ],
  },
  {
    key: "equipe",
    title: "Equipe & distribuição",
    description: "Quem atende os leads e como eles são divididos.",
    fields: [
      { key: "vendedores", label: "Liste vendedores/SDRs (nome + email)", type: "textarea", required: true, helper: "Um por linha: João Silva — joao@empresa.com" },
      { key: "regras_roteamento", label: "Como leads devem ser distribuídos?", type: "textarea", helper: "Por região, segmento, rodízio, etc." },
      { key: "metas", label: "Metas e indicadores principais", type: "textarea" },
      { key: "horario_atendimento", label: "Horário de atendimento", type: "text", placeholder: "Ex: Seg–Sex, 9h–18h" },
    ],
  },
  {
    key: "integracoes",
    title: "Integrações",
    description: "O que vamos conectar para a operação rodar.",
    fields: [
      { key: "whatsapp_numero", label: "Número WhatsApp comercial", type: "text", placeholder: "+55 11 ..." },
      { key: "whatsapp_provider", label: "Provedor WhatsApp atual", type: "select", options: ["Z-API", "Oficial Meta", "Outro", "Nenhum"] },
      { key: "email_dominio", label: "Domínio de envio de email", type: "text", placeholder: "envio.seudominio.com.br" },
      { key: "calendar_email", label: "Email do Google Calendar para agendamentos", type: "email" },
      { key: "fontes_lead", label: "Fontes de lead que você usa hoje", type: "textarea", helper: "Site, Meta Ads, Google Ads, indicação, eventos, etc." },
      { key: "ferramentas_atuais", label: "Ferramentas que usa hoje (CRM, planilhas, etc.)", type: "textarea" },
    ],
  },
  {
    key: "ia",
    title: "IA & automação",
    description: "Como a IA deve falar e quando passar para humano.",
    fields: [
      { key: "tom_voz", label: "Tom de voz da marca", type: "select", options: ["Formal", "Profissional próximo", "Casual amigável", "Descolado"], required: true },
      { key: "scripts_proibidos", label: "O que a IA NÃO pode falar/prometer", type: "textarea", required: true },
      { key: "regras_handoff", label: "Quando passar para um humano?", type: "textarea", required: true, helper: "Ex: pedido de desconto, reclamação, lead enterprise." },
      { key: "fora_horario", label: "Mensagem fora do horário comercial", type: "textarea" },
    ],
  },
  {
    key: "templates",
    title: "Templates & campanhas",
    description: "Mensagens-padrão e sequências iniciais.",
    fields: [
      { key: "primeira_abordagem", label: "Mensagem de primeira abordagem (WhatsApp)", type: "textarea", required: true },
      { key: "primeira_abordagem_email", label: "Email de primeira abordagem", type: "textarea" },
      { key: "follow_up_sequencia", label: "Sequência de follow-up sugerida", type: "textarea", helper: "Ex: D+1, D+3, D+7..." },
      { key: "cta_padrao", label: "CTA padrão (o que pedir ao lead)", type: "text", placeholder: "Ex: agendar call de 15min" },
    ],
  },
  {
    key: "go_live",
    title: "Aprovação & go-live",
    description: "Últimos detalhes para a virada.",
    fields: [
      { key: "responsavel_final", label: "Responsável final pela aprovação", type: "text", required: true },
      { key: "data_desejada", label: "Data desejada para go-live", type: "text", placeholder: "DD/MM/AAAA" },
      { key: "pendencias", label: "Pendências ou bloqueios conhecidos", type: "textarea" },
      { key: "observacoes", label: "Observações finais", type: "textarea" },
    ],
  },
];

export function calculateProgress(responses: Record<string, any>): number {
  const total = ONBOARDING_SECTIONS.reduce((acc, s) => acc + s.fields.length, 0);
  let filled = 0;
  for (const section of ONBOARDING_SECTIONS) {
    const secVals = responses?.[section.key] ?? {};
    for (const f of section.fields) {
      const v = secVals?.[f.key];
      if (v !== undefined && v !== null && String(v).trim() !== "") filled++;
    }
  }
  return Math.round((filled / total) * 100);
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
