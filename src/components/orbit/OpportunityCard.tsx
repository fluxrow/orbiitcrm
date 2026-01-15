import { Building2, DollarSign, Calendar, User } from "lucide-react";

interface OpportunityCardProps {
  opportunity: {
    id: string;
    titulo: string;
    empresa: string;
    valor: number;
    responsavel?: string;
    data_previsao?: string;
  };
  onClick?: () => void;
}

export function OpportunityCard({ opportunity, onClick }: OpportunityCardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div className="kanban-card" onClick={onClick}>
      <h4 className="font-medium mb-2 line-clamp-2">{opportunity.titulo}</h4>
      
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
        <Building2 className="w-3.5 h-3.5" />
        <span className="truncate">{opportunity.empresa}</span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1 font-semibold text-success">
          <DollarSign className="w-4 h-4" />
          {formatCurrency(opportunity.valor)}
        </span>
        
        {opportunity.data_previsao && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            {new Date(opportunity.data_previsao).toLocaleDateString("pt-BR")}
          </span>
        )}
      </div>

      {opportunity.responsavel && (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
          <User className="w-3.5 h-3.5" />
          {opportunity.responsavel}
        </div>
      )}
    </div>
  );
}
