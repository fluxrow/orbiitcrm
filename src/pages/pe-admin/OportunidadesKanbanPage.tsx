import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOportunidades, useMoveOportunidade } from "@/hooks/useOportunidades";
import { useFunilEtapas } from "@/hooks/useFunilEtapas";
import { usePeAuth } from "@/hooks/usePeAuth";
import { useOrgUsers } from "@/hooks/useOrgUsers";
import { useOportunidadesProdutos, useOportunidadesProximaTarefa } from "@/hooks/useKanbanEnrichment";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Eye, CalendarDays } from "lucide-react";
import { OportunidadeDialog } from "@/components/pe-admin/OportunidadeDialog";
import { format, parseISO } from "date-fns";

const ADMIN_ROLES = ["ORG_ADMIN", "ORG_MANAGER"];

export default function OportunidadesKanbanPage() {
  const navigate = useNavigate();
  const { peUser, roleCode, orgId, isSuperAdmin } = usePeAuth();
  const isAdminLike = isSuperAdmin || ADMIN_ROLES.includes(roleCode ?? "");

  const [ownerFilter, setOwnerFilter] = useState<string>("mine");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Resolve owner_user_id for the query
  const resolvedOwner =
    ownerFilter === "mine" ? peUser?.id : ownerFilter === "all" ? undefined : ownerFilter;

  const { data: oportunidades } = useOportunidades(
    resolvedOwner ? { owner_user_id: resolvedOwner } : undefined
  );
  const { data: etapas } = useFunilEtapas();
  const { data: orgUsers } = useOrgUsers(isAdminLike ? orgId : null);
  const { data: produtosMap } = useOportunidadesProdutos(orgId);
  const { data: tarefasMap } = useOportunidadesProximaTarefa(orgId);
  const moveOp = useMoveOportunidade();

  const formatCurrency = (v: number | null) =>
    v != null
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)
      : "—";

  const handleDrop = (etapaId: string) => {
    if (draggedId) {
      moveOp.mutate({ id: draggedId, etapa_id: etapaId });
      setDraggedId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/pe-admin/oportunidades")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Kanban</h1>
            <p className="text-muted-foreground">Arraste oportunidades entre etapas</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Owner filter */}
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">Meus</SelectItem>
              {isAdminLike && <SelectItem value="all">Todos</SelectItem>}
              {isAdminLike &&
                (orgUsers || []).map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nova
          </Button>
        </div>
      </div>

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {(etapas || []).map((etapa: any) => {
          const items = (oportunidades || []).filter((o: any) => o.etapa_id === etapa.id);
          return (
            <div
              key={etapa.id}
              className="flex-shrink-0 w-72 bg-muted/30 rounded-lg p-3 space-y-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(etapa.id)}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-foreground">{etapa.nome}</h3>
                <Badge variant="outline" className="text-xs">
                  {items.length}
                </Badge>
              </div>
              <div className="space-y-2 min-h-[100px]">
                {items.map((o: any) => {
                  const produtos = produtosMap?.get(o.id) || [];
                  const proxTarefa = tarefasMap?.get(o.id);
                  const visibleBadges = produtos.slice(0, 3);
                  const extraCount = produtos.length - 3;

                  return (
                    <Card
                      key={o.id}
                      draggable
                      onDragStart={() => setDraggedId(o.id)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <CardContent className="p-3 space-y-1.5">
                        {/* Title + eye */}
                        <div className="flex items-start justify-between">
                          <p className="font-medium text-sm leading-tight">{o.titulo}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => navigate(`/pe-admin/oportunidades/${o.id}`)}
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                        </div>

                        {/* Client */}
                        <p className="text-xs text-muted-foreground">
                          {o.clientes?.nome_fantasia || o.clientes?.razao_social || ""}
                        </p>

                        {/* Destination */}
                        {o.destino && (
                          <p className="text-xs text-muted-foreground">📍 {o.destino}</p>
                        )}

                        {/* Product badges */}
                        {produtos.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {visibleBadges.map((nome) => (
                              <Badge key={nome} variant="secondary" className="text-[10px] px-1.5 py-0">
                                {nome}
                              </Badge>
                            ))}
                            {extraCount > 0 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                +{extraCount}
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Next task */}
                        {proxTarefa && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <CalendarDays className="w-3 h-3 shrink-0" />
                            <span className="truncate">
                              {format(parseISO(proxTarefa.due_date), "dd/MM")} –{" "}
                              {proxTarefa.titulo}
                            </span>
                          </div>
                        )}

                        {/* Value + probability */}
                        <div className="flex items-center justify-between pt-0.5">
                          <span className="text-xs font-mono text-foreground">
                            {formatCurrency(o.valor_total_estimado)}
                          </span>
                          <span className="text-xs text-muted-foreground">{o.probabilidade}%</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <OportunidadeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
