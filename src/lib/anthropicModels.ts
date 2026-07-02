// Modelos Anthropic disponíveis para seleção no painel /orbit/config.
// O backend faz fallback automático (via /v1/models) caso o modelo escolhido não
// esteja disponível na conta Anthropic no momento da chamada.

export interface AnthropicModelOption {
  id: string;
  label: string;
  description: string;
}

export const ANTHROPIC_MODEL_OPTIONS: AnthropicModelOption[] = [
  {
    id: "claude-sonnet-4-5",
    label: "Claude Sonnet 4.5 (recomendado)",
    description: "Modelo mais recente. Melhor equilíbrio entre qualidade e custo.",
  },
  {
    id: "claude-sonnet-4-5-20250929",
    label: "Claude Sonnet 4.5 (versão fixa 2025-09-29)",
    description: "Snapshot específico do Sonnet 4.5, evita mudanças de versão.",
  },
  {
    id: "claude-opus-4-1",
    label: "Claude Opus 4.1",
    description: "Máxima capacidade de raciocínio. Mais caro e mais lento.",
  },
  {
    id: "claude-sonnet-4-0",
    label: "Claude Sonnet 4.0",
    description: "Geração anterior do Sonnet. Boa relação custo/desempenho.",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    description: "Rápido e barato. Ideal para classificações e respostas curtas.",
  },
];

export const DEFAULT_ANTHROPIC_MODEL_ID = "claude-sonnet-4-5";
