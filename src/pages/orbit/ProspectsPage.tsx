import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { ProspectDialog } from "@/components/orbit/ProspectDialog";
import { ProspectActionCard } from "@/components/orbit/ProspectActionCard";
import { ProspectTimeline } from "@/components/orbit/ProspectTimeline";
import { AddToFunnelDialog } from "@/components/orbit/AddToFunnelDialog";
import { AddNoteDialog } from "@/components/orbit/AddNoteDialog";
import { ScheduleMeetingDialog } from "@/components/orbit/ScheduleMeetingDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Search, Plus, Loader2, ChevronLeft, ChevronRight, X,
  GitBranch, Send, Trash2, Tag, Upload,
} from "lucide-react";
import { ImportProspectsWizard } from "@/components/orbit/ImportProspectsWizard";
import { ImportHistoryPanel } from "@/components/orbit/ImportHistoryPanel";
import { Badge } from "@/components/ui/badge";
import { useOrbitProspects, useDeleteProspect } from "@/hooks/useOrbitProspects";
import { useDebounce } from "@/hooks/useDebounce";
import { useOrbitPeLinks } from "@/hooks/usePromoteProspect";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "novo", label: "Novo" },
  { value: "em_qualificacao", label: "Em Qualificação" },
  { value: "qualificado", label: "Qualificado" },
  { value: "desqualificado", label: "Desqualificado" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "Mais recentes" },
  { value: "oldest", label: "Mais antigos" },
  { value: "name", label: "Nome A-Z" },
];

const PAGE_SIZE = 50;

export default function ProspectsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [origemFilter, setOrigemFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [whatsappFilter, setWhatsappFilter] = useState("all");
  const [whatsappStatusFilter, setWhatsappStatusFilter] = useState("all");
  const [emailFilter, setEmailFilter] = useState("all");
  const [contatoFilter, setContatoFilter] = useState("all");
  const [page, setPage] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<Tables<"orbit_prospects"> | null>(null);

  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineProspect, setTimelineProspect] = useState<any>(null);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteProspect, setNoteProspect] = useState<any>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleProspect, setScheduleProspect] = useState<any>(null);

  const [funnelOpen, setFunnelOpen] = useState(false);
  const [funnelProspects, setFunnelProspects] = useState<any[]>([]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);

  const { user } = useAuth();
  // CRITICAL: empresa from URL tenant — not from profiles.empresa_id.
  // Prevents cross-tenant data leak for users with access to multiple empresas.
  const { empresaId: tenantEmpresaId } = useTenant();
  const myProfile = tenantEmpresaId ? { empresa_id: tenantEmpresaId } : null;

  const { data: prospects, isLoading } = useOrbitProspects({
    search: debouncedSearch || undefined,
    status_qualificacao: statusFilter,
  });
  const { data: peLinks } = useOrbitPeLinks();
  const deleteProspect = useDeleteProspect();

  const linkedProspectIds = useMemo(() => new Set(peLinks?.map((l: any) => l.prospect_id) || []), [peLinks]);

  // Derive unique origens for filter
  const origens = useMemo(() => {
    const set = new Set<string>();
    prospects?.forEach((p: any) => {
      const o = p.origem_contato || p.origem_lead;
      if (o) set.add(o);
    });
    return Array.from(set).sort();
  }, [prospects]);

  // Filter & sort
  const filtered = useMemo(() => {
    let result = [...(prospects || [])];

    if (origemFilter !== "all") {
      result = result.filter((p: any) => (p.origem_contato || p.origem_lead) === origemFilter);
    }

    if (whatsappFilter === "com") result = result.filter((p: any) => p.whatsapp != null && p.whatsapp !== "");
    if (whatsappFilter === "sem") result = result.filter((p: any) => p.whatsapp == null || p.whatsapp === "");

    if (whatsappStatusFilter !== "all") result = result.filter((p: any) => p.whatsapp_status === whatsappStatusFilter);

    if (emailFilter === "com") result = result.filter((p: any) => p.email_principal != null && p.email_principal !== "");
    if (emailFilter === "sem") result = result.filter((p: any) => p.email_principal == null || p.email_principal === "");

    if (contatoFilter === "whatsapp") result = result.filter((p: any) => p.whatsapp_status === "valido");
    if (contatoFilter === "email") result = result.filter((p: any) => p.email_principal != null && p.email_principal !== "");
    if (contatoFilter === "ambos") result = result.filter((p: any) => p.whatsapp_status === "valido" && p.email_principal != null && p.email_principal !== "");
    if (contatoFilter === "nenhum") result = result.filter((p: any) => (p.whatsapp == null || p.whatsapp_status !== "valido") && (p.email_principal == null || p.email_principal === ""));

    if (sortBy === "oldest") result.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    else if (sortBy === "name") result.sort((a: any, b: any) => (a.nome_razao || "").localeCompare(b.nome_razao || ""));

    return result;
  }, [prospects, origemFilter, whatsappFilter, whatsappStatusFilter, emailFilter, contatoFilter, sortBy]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleEdit = (prospect: any) => {
    setSelectedProspect(prospect);
    setDialogOpen(true);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Excluir ${selectedIds.size} prospect(s)?`)) return;
    let ok = 0;
    for (const id of selectedIds) {
      try { await deleteProspect.mutateAsync(id); ok++; } catch { /* skip */ }
    }
    toast.success(`${ok} prospect(s) excluído(s)`);
    setSelectedIds(new Set());
  };

  const handleBulkFunnel = () => {
    const selected = filtered.filter((p: any) => selectedIds.has(p.id));
    setFunnelProspects(selected);
    setFunnelOpen(true);
  };

  const empresaId = myProfile?.empresa_id || "";

  return (
    <OrbitLayout>
      <TooltipProvider>
        <PageHeader
          title="Prospects"
          description="Lead Action Hub — gerencie e interaja com seus prospects"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />Importar CSV
              </Button>
              <Button size="sm" onClick={() => { setSelectedProspect(null); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />Novo Prospect
              </Button>
            </div>
          }
        />
        <ImportProspectsWizard
          open={importOpen}
          onOpenChange={setImportOpen}
          empresaId={myProfile?.empresa_id}
        />

        <ImportHistoryPanel empresaId={myProfile?.empresa_id} />

        {/* Search & Filters */}
        <div className="space-y-3 mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone, empresa ou email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-12 h-12 text-base"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={origemFilter} onValueChange={(v) => { setOrigemFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas origens</SelectItem>
                {origens.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(0); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Ordenar" /></SelectTrigger>
              <SelectContent>{SORT_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={whatsappFilter} onValueChange={(v) => { setWhatsappFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="WhatsApp" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">WhatsApp: Todos</SelectItem>
                <SelectItem value="com">Com WhatsApp</SelectItem>
                <SelectItem value="sem">Sem WhatsApp</SelectItem>
              </SelectContent>
            </Select>
            <Select value={whatsappStatusFilter} onValueChange={(v) => { setWhatsappStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="WA verificado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">WA verificado: Todos</SelectItem>
                <SelectItem value="valido">Verificado</SelectItem>
                <SelectItem value="nao_verificado">Não verificado</SelectItem>
                <SelectItem value="invalido">Inválido</SelectItem>
              </SelectContent>
            </Select>
            <Select value={emailFilter} onValueChange={(v) => { setEmailFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Email" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Email: Todos</SelectItem>
                <SelectItem value="com">Com email</SelectItem>
                <SelectItem value="sem">Sem email</SelectItem>
              </SelectContent>
            </Select>
            <Select value={contatoFilter} onValueChange={(v) => { setContatoFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Contato disponível" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Contato: Todos</SelectItem>
                <SelectItem value="whatsapp">WhatsApp válido</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="ambos">Ambos</SelectItem>
                <SelectItem value="nenhum">Nenhum</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-muted-foreground flex items-center">
              {filtered.length} prospect{filtered.length !== 1 ? "s" : ""}
            </div>
          </div>

          {/* Active filter chips */}
          {(() => {
            const chips: { label: string; onRemove: () => void }[] = [];
            const labelMap: Record<string, Record<string, string>> = {
              whatsapp: { com: "Com WhatsApp", sem: "Sem WhatsApp" },
              whatsappStatus: { valido: "Verificado", nao_verificado: "Não verificado", invalido: "Inválido" },
              email: { com: "Com email", sem: "Sem email" },
              contato: { whatsapp: "WhatsApp válido", email: "Email", ambos: "Ambos", nenhum: "Nenhum" },
              status: Object.fromEntries(STATUS_OPTIONS.filter(s => s.value !== "all").map(s => [s.value, s.label])),
            };
            if (statusFilter !== "all") chips.push({ label: `Status: ${labelMap.status[statusFilter] || statusFilter}`, onRemove: () => setStatusFilter("all") });
            if (origemFilter !== "all") chips.push({ label: `Origem: ${origemFilter}`, onRemove: () => setOrigemFilter("all") });
            if (whatsappFilter !== "all") chips.push({ label: `WhatsApp: ${labelMap.whatsapp[whatsappFilter]}`, onRemove: () => setWhatsappFilter("all") });
            if (whatsappStatusFilter !== "all") chips.push({ label: `WA Status: ${labelMap.whatsappStatus[whatsappStatusFilter]}`, onRemove: () => setWhatsappStatusFilter("all") });
            if (emailFilter !== "all") chips.push({ label: `Email: ${labelMap.email[emailFilter]}`, onRemove: () => setEmailFilter("all") });
            if (contatoFilter !== "all") chips.push({ label: `Contato: ${labelMap.contato[contatoFilter]}`, onRemove: () => setContatoFilter("all") });
            if (chips.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <Badge key={c.label} variant="secondary" className="gap-1 pr-1">
                    {c.label}
                    <button onClick={() => { c.onRemove(); setPage(0); }} className="ml-1 hover:bg-muted rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <button onClick={() => { setStatusFilter("all"); setOrigemFilter("all"); setWhatsappFilter("all"); setWhatsappStatusFilter("all"); setEmailFilter("all"); setContatoFilter("all"); setPage(0); }} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Limpar todos
                </button>
              </div>
            );
          })()}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : paged.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Nenhum prospect encontrado.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {paged.map((p: any) => (
                <ProspectActionCard
                  key={p.id}
                  prospect={p}
                  isConverted={linkedProspectIds.has(p.id)}
                  isSelected={selectedIds.has(p.id)}
                  onToggleSelect={handleToggleSelect}
                  onEdit={handleEdit}
                  onWhatsApp={async (pr) => {
                    const raw = pr.whatsapp || pr.telefone;
                    if (!raw) return;
                    let num = raw.replace(/\D/g, "");
                    if (num.length >= 10 && num.length <= 11 && !num.startsWith("55")) {
                      num = "55" + num;
                    }

                    let { data: conversa } = await supabase
                      .from("orbit_conversas")
                      .select("id")
                      .eq("prospect_id", pr.id)
                      .eq("status", "aberta")
                      .maybeSingle();

                    if (!conversa) {
                      const { data: nova, error } = await supabase
                        .from("orbit_conversas")
                        .insert({
                          empresa_id: pr.empresa_id,
                          prospect_id: pr.id,
                          canal: "whatsapp",
                          telefone_whatsapp: num,
                          status: "aberta",
                        })
                        .select("id")
                        .single();
                      if (error) { toast.error("Erro ao criar conversa"); return; }
                      conversa = nova;
                    }

                    navigate(`../conversas?id=${conversa!.id}`);
                  }}
                  onEmail={(pr) => {
                    if (pr.email_principal) {
                      window.open(`mailto:${pr.email_principal}`, "_blank");
                    }
                  }}
                  onAddNote={(pr) => { setNoteProspect(pr); setNoteOpen(true); }}
                  onCreateTask={(pr) => { toast.info("Funcionalidade de tarefas em breve"); }}
                  onAddToFunnel={(pr) => { setFunnelProspects([pr]); setFunnelOpen(true); }}
                  onSchedule={(pr) => { setScheduleProspect(pr); setScheduleOpen(true); }}
                  onViewHistory={(pr) => { setTimelineProspect(pr); setTimelineOpen(true); }}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {page + 1} de {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border p-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}</span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  <X className="h-4 w-4 mr-1" />Limpar
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleBulkFunnel}>
                  <GitBranch className="h-4 w-4 mr-1" />Funil
                </Button>
                <Button variant="outline" size="sm" onClick={() => toast.info("Campanha em breve")}>
                  <Send className="h-4 w-4 mr-1" />Campanha
                </Button>
                <Button variant="outline" size="sm" onClick={() => toast.info("Tags em breve")}>
                  <Tag className="h-4 w-4 mr-1" />Tag
                </Button>
                <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                  <Trash2 className="h-4 w-4 mr-1" />Excluir
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Dialogs */}
        <ProspectDialog open={dialogOpen} onOpenChange={setDialogOpen} prospect={selectedProspect} />
        <ProspectTimeline open={timelineOpen} onOpenChange={setTimelineOpen} prospect={timelineProspect} />
        <AddNoteDialog open={noteOpen} onOpenChange={setNoteOpen} prospect={noteProspect} empresaId={empresaId} userId={user?.id} />
        <AddToFunnelDialog open={funnelOpen} onOpenChange={setFunnelOpen} prospects={funnelProspects} empresaId={empresaId} />
        <ScheduleMeetingDialog open={scheduleOpen} onOpenChange={setScheduleOpen} prospect={scheduleProspect} empresaId={empresaId} />
      </TooltipProvider>
    </OrbitLayout>
  );
}
