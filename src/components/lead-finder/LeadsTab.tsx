import { useState } from "react";
import { useLeads, useBulkUpdateLeads, Lead } from "@/hooks/useLeadFinder";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  Linkedin,
  Building2,
  MapPin,
  CheckCircle2,
  XCircle,
  Download,
  UserPlus,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function LeadsTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);

  const { data: leads, isLoading } = useLeads(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const bulkUpdate = useBulkUpdateLeads();

  const filteredLeads = leads?.filter(
    (lead) =>
      !searchQuery ||
      lead.nome?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.empresa_nome?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleLead = (id: string) => {
    setSelectedLeads((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedLeads.length === filteredLeads?.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(filteredLeads?.map((l) => l.id) || []);
    }
  };

  const handleBulkAction = (status: string) => {
    if (selectedLeads.length === 0) return;
    bulkUpdate.mutate({
      ids: selectedLeads,
      updates: { status },
    });
    setSelectedLeads([]);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "novo":
        return <Badge className="bg-primary/20 text-primary border-0">novo</Badge>;
      case "aprovado":
        return <Badge className="bg-success/20 text-success border-0">aprovado</Badge>;
      case "rejeitado":
        return <Badge className="bg-destructive/20 text-destructive border-0">rejeitado</Badge>;
      case "importado":
        return <Badge className="bg-accent/20 text-accent border-0">importado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getEnrichmentBadge = (status: string) => {
    switch (status) {
      case "sucesso":
        return <Badge className="bg-success/20 text-success border-0">valid</Badge>;
      case "falha":
        return <Badge className="bg-destructive/20 text-destructive border-0">invalid</Badge>;
      case "processando":
        return <Badge className="bg-warning/20 text-warning border-0">validando</Badge>;
      default:
        return null;
    }
  };

  const maskName = (name: string | null) => {
    if (!name) return "—";
    const parts = name.split(" ");
    if (parts.length <= 1) return name.substring(0, 3) + "***";
    return parts[0] + " " + parts.slice(1).map((p) => p.substring(0, 2) + "***").join(" ");
  };

  return (
    <div className="space-y-4">
      {/* Header with count */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          Leads Encontrados
          <Badge variant="secondary" className="ml-2">
            {filteredLeads?.length || 0}
          </Badge>
        </h2>
        {selectedLeads.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedLeads.length} selecionados
            </span>
            <Button variant="secondary" size="sm" onClick={() => handleBulkAction("aprovado")}>
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Aprovar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleBulkAction("rejeitado")}>
              <XCircle className="w-4 h-4 mr-1" />
              Rejeitar
            </Button>
            <Button size="sm">
              <UserPlus className="w-4 h-4 mr-1" />
              Importar para CRM
            </Button>
          </div>
        )}
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email, empresa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Filtros
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="novo">Novos</SelectItem>
                    <SelectItem value="aprovado">Aprovados</SelectItem>
                    <SelectItem value="rejeitado">Rejeitados</SelectItem>
                    <SelectItem value="importado">Importados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Exportar
        </Button>
      </div>

      {/* Select all */}
      <div className="flex items-center gap-2 px-4">
        <Checkbox
          checked={selectedLeads.length === filteredLeads?.length && filteredLeads.length > 0}
          onCheckedChange={toggleAll}
        />
        <span className="text-sm text-muted-foreground">Selecionar todos</span>
      </div>

      {/* Leads list */}
      <div className="glass-card divide-y divide-border">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        ) : filteredLeads?.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhum lead encontrado
          </div>
        ) : (
          filteredLeads?.map((lead) => (
            <div key={lead.id} className="hover:bg-secondary/30 transition-colors">
              <div
                className="p-4 flex items-center gap-4 cursor-pointer"
                onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}
              >
                <Checkbox
                  checked={selectedLeads.includes(lead.id)}
                  onCheckedChange={() => toggleLead(lead.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{maskName(lead.nome)}</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-sm text-muted-foreground truncate">
                      {lead.cargo || "—"}
                    </span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-sm font-medium truncate">{lead.empresa_nome || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusBadge(lead.status)}
                    {getEnrichmentBadge(lead.enrichment_status)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-medium">Score: {lead.score}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {lead.cidade || lead.estado || lead.pais || "—"}
                    </div>
                  </div>
                  {expandedLead === lead.id ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {expandedLead === lead.id && (
                <div className="px-4 pb-4 pt-0 border-t border-border/50 bg-secondary/20">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{lead.email || "Não disponível"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{lead.telefone || "Não disponível"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Linkedin className="w-4 h-4 text-muted-foreground" />
                      {lead.linkedin_url ? (
                        <a
                          href={lead.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Ver perfil
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">Não disponível</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      {lead.empresa_linkedin ? (
                        <a
                          href={lead.empresa_linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Ver empresa
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">Não disponível</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleBulkAction("aprovado")}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleBulkAction("rejeitado")}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Rejeitar
                    </Button>
                    <Button size="sm">
                      <UserPlus className="w-4 h-4 mr-1" />
                      Importar para CRM
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
