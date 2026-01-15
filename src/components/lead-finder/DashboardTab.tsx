import { useLeadFinderStats, useLeadSearches, LeadSearch } from "@/hooks/useLeadFinder";
import { StatsCard } from "@/components/orbit/StatsCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database,
  Search,
  Users,
  UserPlus,
  Clock,
  CheckCircle2,
  Play,
  Eye,
  MoreHorizontal,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DashboardTabProps {
  onViewSearch: (search: LeadSearch) => void;
  onNewSearch: () => void;
}

export function DashboardTab({ onViewSearch, onNewSearch }: DashboardTabProps) {
  const stats = useLeadFinderStats();
  const { data: searches, isLoading } = useLeadSearches();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "concluida":
        return (
          <Badge className="bg-success/20 text-success border-0">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Concluída
          </Badge>
        );
      case "executando":
        return (
          <Badge className="bg-primary/20 text-primary border-0">
            <Play className="w-3 h-3 mr-1 animate-pulse" />
            Executando
          </Badge>
        );
      case "erro":
        return (
          <Badge className="bg-destructive/20 text-destructive border-0">
            Erro
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border-0">
            <Clock className="w-3 h-3 mr-1" />
            Pendente
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          title="Fontes"
          value={stats.sourcesCount}
          icon={Database}
          change="Fontes ativas"
          changeType="neutral"
        />
        <StatsCard
          title="Buscas"
          value={stats.searchesCount}
          icon={Search}
          change="Total de buscas"
          changeType="neutral"
        />
        <StatsCard
          title="Encontrados"
          value={stats.leadsFound}
          icon={Users}
          change="Leads encontrados"
          changeType="neutral"
        />
        <StatsCard
          title="Novos"
          value={stats.newLeads}
          icon={UserPlus}
          change={`${stats.newLeads} leads novos`}
          changeType="positive"
        />
      </div>

      {/* Recent Searches */}
      <div className="glass-card">
        <div className="p-5 border-b border-border">
          <h3 className="font-semibold text-lg">Buscas Recentes</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Últimas buscas de leads realizadas
          </p>
        </div>
        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Carregando...
            </div>
          ) : searches?.length === 0 ? (
            <div className="p-8 text-center">
              <Search className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground mb-4">
                Nenhuma busca realizada ainda
              </p>
              <Button onClick={onNewSearch}>
                <Search className="w-4 h-4 mr-2" />
                Criar Primeira Busca
              </Button>
            </div>
          ) : (
            searches?.slice(0, 5).map((search) => (
              <div
                key={search.id}
                className="p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Search className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{search.nome}</span>
                      {getStatusBadge(search.status)}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span>
                        {formatDistanceToNow(new Date(search.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                      <span>•</span>
                      <span>{search.leads_encontrados} encontrados</span>
                      {search.leads_importados > 0 && (
                        <>
                          <span>•</span>
                          <span>{search.leads_importados} importados</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewSearch(search)}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Ver
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewSearch(search)}>
                        Ver resultados
                      </DropdownMenuItem>
                      <DropdownMenuItem>Executar novamente</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">
                        Excluir busca
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
