import { Webhook, GitBranch, Send, Activity, Upload, type LucideIcon } from "lucide-react";

export type Pillar = {
  icon: LucideIcon;
  title: string;
  description: string;
  stack: string[];
};

export const PILLARS: Pillar[] = [
  {
    icon: Webhook,
    title: "Hub de Ingestão Universal",
    description:
      "Typebot, Google Sheets (Apps Script), formulários e Meta Ads entram pela mesma porta. Mapeamento visual de campos, validação de CPF/CNPJ e normalização de WhatsApp acontecem antes do lead tocar no seu funil.",
    stack: ["Webhook", "Apps Script", "Meta Ads"],
  },
  {
    icon: GitBranch,
    title: "Motor de Fluxos & Condições",
    description:
      "Disparos em tempo real com filtros cirúrgicos por origem, tipo de fonte e qualquer chave do payload — inclusive utm_source, utm_campaign e campos custom do seu formulário.",
    stack: ["Realtime", "JSONB filters", "UTM-aware"],
  },
  {
    icon: Send,
    title: "Ações Inteligentes de Escalonamento",
    description:
      "Mídia rica (áudio, vídeo, PDF), movimentação automática entre etapas, tarefas para o SDR e agendamento via Google Calendar respeitando FreeBusy do mentor.",
    stack: ["Rich media", "Pipeline auto", "Calendar FreeBusy"],
  },
  {
    icon: Activity,
    title: "Painel de Observabilidade",
    description:
      "Latência das Edge Functions em sub-segundo, taxa de sucesso por automação e log detalhado de cada webhook recebido. Você vê a saúde da operação como quem opera um SaaS de produto.",
    stack: ["Sub-second", "Run logs", "KPIs live"],
  },
  {
    icon: Upload,
    title: "Importador Inteligente & Gestão em Massa",
    description:
      "Upload de bases legadas via CSV com mapeamento de-para visual, campos extras preservados em JSONB, ações em lote (tags, movimentação, exclusão) e Soft-Delete para nunca perder histórico.",
    stack: ["CSV mapper", "JSONB safe", "Soft-delete"],
  },
];
