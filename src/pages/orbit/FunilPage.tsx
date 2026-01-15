import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { FunnelColumn } from "@/components/orbit/FunnelColumn";
import { OpportunityCard } from "@/components/orbit/OpportunityCard";
import { Button } from "@/components/ui/button";
import { Plus, Filter, DollarSign } from "lucide-react";

const funnelStages = [
  {
    id: "qualification",
    title: "Qualificação",
    color: "bg-stage-qualification",
    opportunities: [
      {
        id: "1",
        titulo: "Implementação ERP",
        empresa: "Tech Solutions Ltda",
        valor: 50000,
        responsavel: "Ana Silva",
        data_previsao: "2024-02-15",
      },
      {
        id: "2",
        titulo: "Consultoria de Processos",
        empresa: "Indústria ABC",
        valor: 25000,
        responsavel: "Carlos Santos",
      },
    ],
  },
  {
    id: "proposal",
    title: "Proposta",
    color: "bg-stage-proposal",
    opportunities: [
      {
        id: "3",
        titulo: "Sistema de Automação",
        empresa: "Logística Express",
        valor: 80000,
        responsavel: "Maria Costa",
        data_previsao: "2024-02-28",
      },
    ],
  },
  {
    id: "negotiation",
    title: "Negociação",
    color: "bg-stage-negotiation",
    opportunities: [
      {
        id: "4",
        titulo: "Plataforma E-commerce",
        empresa: "Moda Fashion",
        valor: 120000,
        responsavel: "João Lima",
        data_previsao: "2024-03-10",
      },
      {
        id: "5",
        titulo: "App Mobile",
        empresa: "Fitness Pro",
        valor: 45000,
        responsavel: "Ana Silva",
        data_previsao: "2024-03-05",
      },
    ],
  },
  {
    id: "closing",
    title: "Fechamento",
    color: "bg-stage-closing",
    opportunities: [
      {
        id: "6",
        titulo: "Integração de Sistemas",
        empresa: "Bank Secure",
        valor: 200000,
        responsavel: "Carlos Santos",
        data_previsao: "2024-02-20",
      },
    ],
  },
];

const totalPipeline = funnelStages.reduce(
  (acc, stage) =>
    acc + stage.opportunities.reduce((sum, opp) => sum + opp.valor, 0),
  0
);

export default function FunilPage() {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
    }).format(value);
  };

  return (
    <OrbitLayout>
      <PageHeader
        title="Funil de Vendas"
        description="Acompanhe suas oportunidades em cada etapa"
        action={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-success/10 text-success">
              <DollarSign className="w-5 h-5" />
              <span className="font-semibold">
                Pipeline: {formatCurrency(totalPipeline)}
              </span>
            </div>
            <Button variant="secondary">
              <Filter className="w-4 h-4 mr-2" />
              Filtrar
            </Button>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Nova Oportunidade
            </Button>
          </div>
        }
      />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {funnelStages.map((stage) => {
          const stageValue = stage.opportunities.reduce(
            (sum, opp) => sum + opp.valor,
            0
          );
          return (
            <FunnelColumn
              key={stage.id}
              title={stage.title}
              count={stage.opportunities.length}
              value={formatCurrency(stageValue)}
              color={stage.color}
            >
              {stage.opportunities.map((opp) => (
                <OpportunityCard key={opp.id} opportunity={opp} />
              ))}
            </FunnelColumn>
          );
        })}

        {/* Won/Lost columns */}
        <FunnelColumn title="Ganho" count={0} color="bg-stage-won">
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Arraste cards aqui
          </div>
        </FunnelColumn>

        <FunnelColumn title="Perdido" count={0} color="bg-stage-lost">
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Arraste cards aqui
          </div>
        </FunnelColumn>
      </div>
    </OrbitLayout>
  );
}
