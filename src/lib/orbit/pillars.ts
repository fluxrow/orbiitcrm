import { Inbox, Target, CalendarCheck, LineChart, Upload, type LucideIcon } from "lucide-react";

export type Pillar = {
  icon: LucideIcon;
  title: string;
  description: string;
  stack: string[];
};

export const PILLARS: Pillar[] = [
  {
    icon: Inbox,
    title: "Captura de leads de qualquer canal",
    description:
      "Recebe leads do seu anúncio, do Instagram, do formulário do site ou da indicação — todos na mesma esteira. Nada cai no esquecimento, nada vira linha esquecida em planilha.",
    stack: ["Anúncios", "Formulários", "Indicação"],
  },
  {
    icon: Target,
    title: "Perseguição automática até agendar",
    description:
      "O Orbit não desiste do lead. Manda mensagem, áudio e lembrete no ritmo certo, sem parecer robô, até a call de fechamento cair na sua agenda.",
    stack: ["Cadência humana", "Multi-toque", "Sem desistência"],
  },
  {
    icon: CalendarCheck,
    title: "Confirmação e lembrete da call",
    description:
      "Dispara confirmação imediata, lembrete 24h e 1h antes da call e reagendamento automático quando o lead pede. Você fala só com quem realmente vai aparecer.",
    stack: ["Confirmação", "Lembrete", "Reagendamento"],
  },
  {
    icon: LineChart,
    title: "Painel do seu caixa em tempo real",
    description:
      "Quantas calls foram marcadas hoje, quantas confirmaram, quanto entrou. Você opera sua mentoria olhando o dinheiro, não a caixa de WhatsApp.",
    stack: ["Calls marcadas", "Confirmadas", "Faturamento"],
  },
  {
    icon: Upload,
    title: "Sobe sua base antiga em 5 minutos",
    description:
      "Importa seus leads antigos do Excel, separa quem ainda tem fit e começa a faturar em cima da base que já estava parada — sem perder histórico e sem retrabalho.",
    stack: ["Importação", "Base antiga", "Faturamento extra"],
  },
];
