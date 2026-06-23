import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Search, Filter, X, Mail, Phone, Building2, User, ChevronDown, ChevronUp,
  UserCheck, Users, Plus, Trash2, ArrowUpDown, AlertTriangle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrbitProspects, useOrbitProspectsCount } from "@/hooks/useOrbitProspects";
import { useOrbitSendGroups, useCreateSendGroup, useDeleteSendGroup } from "@/hooks/useOrbitSendGroups";
import { useProspectEngagement } from "@/hooks/useProspectEngagement";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Flame, Eye, MousePointerClick, AlertOctagon } from "lucide-react";
import { toast } from "sonner";

type Canal = "email" | "whatsapp";

interface CampaignFilters {
  status_qualificacao?: string[];
  segmento?: string;
  cidade?: string;
  estado?: string;
  origem_contato?: string;
  origem_lead?: string;
  tags?: string[];
  score_min?: number;
  responsavel_id?: string;
  apenas_consentimento?: boolean;
  tem_email?: boolean;
  tem_telefone?: boolean;
  tipo?: string;
  excluir_campanha_id?: string;
  apenas_abriu_campanha_id?: string;
  nao_abriu_campanha_id?: string;
  // Email engagement filters (aggregate across all campaigns)
  engaj_comportamento?: "abriu" | "clicou" | "engajou" | "nao_abriu" | "nunca_recebeu" | "qualquer";
  engaj_janela_dias?: number; // 7 / 30 / 90 / 180 / 0 (todos)
  engaj_min_aberturas?: number;
  engaj_min_cliques?: number;
  excluir_bounced?: boolean;
}

interface RecipientSelectorProps {
  canal: Canal;
  filtros: CampaignFilters;
  onFiltrosChange: (f: CampaignFilters) => void;
  selectedProspectIds: string[];
  onSelectedProspectIdsChange: (ids: string[]) => void;
  selectedGroupIds: string[];
  onSelectedGroupIdsChange: (ids: string[]) => void;
  totalRecipients: number;
}

type SortKey = "nome" | "empresa" | "created_at";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

export function RecipientSelector({
  canal,
  filtros,
  onFiltrosChange,
  selectedProspectIds,
  onSelectedProspectIdsChange,
  selectedGroupIds,
  onSelectedGroupIdsChange,
  totalRecipients,
}: RecipientSelectorProps) {
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState("individual");

  // Group dialog state
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [newGroupProspectIds, setNewGroupProspectIds] = useState<string[]>([]);
  const [groupProspectSearch, setGroupProspectSearch] = useState("");

  const { data: prospects } = useOrbitProspects();
  const { data: totalProspectsCount } = useOrbitProspectsCount();
  const { data: sendGroups } = useOrbitSendGroups();
  const createSendGroup = useCreateSendGroup();
  const deleteSendGroup = useDeleteSendGroup();

  const { data: companyProfiles } = useQuery({
    queryKey: ["company-profiles-for-filter"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome, email").eq("ativo", true);
      if (error) throw error;
      return data;
    },
  });

  // Resolve empresa_id from prospects to load engagement summary
  const empresaId = prospects?.[0]?.empresa_id || null;
  const engajJanela = filtros.engaj_janela_dias ?? 90;
  const { data: engagementMap } = useProspectEngagement(empresaId, engajJanela);

  // Fetch past campaigns for segmentation filters
  const { data: pastCampaigns } = useQuery({
    queryKey: ["past-campaigns-for-segmentation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_campaigns")
        .select("id, nome, canal, status")
        .in("status", ["enviando", "concluida", "pausada", "pausada_por_limite"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch recipient prospect_ids for active campaign filters
  const campaignFilterId = filtros.excluir_campanha_id || filtros.apenas_abriu_campanha_id || filtros.nao_abriu_campanha_id || null;
  const { data: campaignRecipients } = useQuery({
    queryKey: ["campaign-recipients-filter", campaignFilterId],
    queryFn: async () => {
      if (!campaignFilterId) return null;
      const { data, error } = await supabase
        .from("orbit_campaign_recipients")
        .select("prospect_id, status, opened_at")
        .eq("campaign_id", campaignFilterId);
      if (error) throw error;
      return data;
    },
    enabled: !!campaignFilterId,
  });

  const distinctValues = useMemo(() => {
    if (!prospects) return { segmentos: [], estados: [], cidades: [], origens_contato: [], origens_lead: [], tags: [] };
    return {
      segmentos: [...new Set(prospects.map(p => p.segmento).filter(Boolean))] as string[],
      estados: [...new Set(prospects.map(p => p.estado).filter(Boolean))] as string[],
      cidades: [...new Set(prospects.map(p => p.cidade).filter(Boolean))] as string[],
      origens_contato: [...new Set(prospects.map(p => p.origem_contato).filter(Boolean))] as string[],
      origens_lead: [...new Set(prospects.map(p => p.origem_lead).filter(Boolean))] as string[],
      tags: [...new Set(prospects.flatMap(p => (p.tags as string[]) || []).filter(Boolean))] as string[],
    };
  }, [prospects]);

  // Imported CSV lists derived from prospects' `lista:*` tags
  const importedLists = useMemo(() => {
    if (!prospects) return [] as { tag: string; label: string; prospectIds: string[]; eligibleCount: number }[];
    const byTag = new Map<string, string[]>();
    for (const p of prospects) {
      const tags = (p.tags as string[]) || [];
      for (const t of tags) {
        if (!t || !t.startsWith("lista:")) continue;
        if (!byTag.has(t)) byTag.set(t, []);
        byTag.get(t)!.push(p.id);
      }
    }
    const eligible = (p: any) =>
      canal === "email" ? !!p.email_principal && !p.optout_email : !!(p.whatsapp || p.telefone) && !p.optout_whatsapp;
    const result = Array.from(byTag.entries()).map(([tag, ids]) => {
      const raw = tag.replace(/^lista:/, "");
      // parse trailing -YYYYMMDD-HHmm if present
      const m = raw.match(/^(.*)-(\d{8})-(\d{4})$/);
      let label = raw;
      if (m) {
        const name = m[1].replace(/-/g, " ");
        const d = m[2], h = m[3];
        label = `${name} · ${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)} ${h.slice(0, 2)}:${h.slice(2, 4)}`;
      } else {
        label = raw.replace(/-/g, " ");
      }
      const elig = ids.filter(id => {
        const p = prospects.find(pr => pr.id === id);
        return p && eligible(p);
      });
      return { tag, label, prospectIds: ids, eligibleCount: elig.length };
    });
    return result.sort((a, b) => b.tag.localeCompare(a.tag));
  }, [prospects, canal]);


  // Apply filters + search
  const filteredProspects = useMemo(() => {
    if (!prospects) return [];
    let list = [...prospects];

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.nome_razao?.toLowerCase().includes(q) ||
        p.nome_fantasia?.toLowerCase().includes(q) ||
        p.email_principal?.toLowerCase().includes(q) ||
        p.telefone?.includes(q) ||
        p.whatsapp?.includes(q) ||
        p.segmento?.toLowerCase().includes(q)
      );
    }

    // Filters
    if (filtros.status_qualificacao?.length) {
      list = list.filter(p => filtros.status_qualificacao!.includes(p.status_qualificacao || ""));
    }
    if (filtros.segmento) list = list.filter(p => p.segmento === filtros.segmento);
    if (filtros.estado) list = list.filter(p => p.estado === filtros.estado);
    if (filtros.cidade) list = list.filter(p => p.cidade?.toLowerCase().includes(filtros.cidade!.toLowerCase()));
    if (filtros.origem_contato) list = list.filter(p => p.origem_contato === filtros.origem_contato);
    if (filtros.origem_lead) list = list.filter(p => p.origem_lead === filtros.origem_lead);
    if (filtros.tags?.length) {
      list = list.filter(p => {
        const pTags = (p.tags as string[]) || [];
        return filtros.tags!.some(t => pTags.includes(t));
      });
    }
    if (filtros.score_min && filtros.score_min > 0) {
      list = list.filter(p => (p.score || 0) >= filtros.score_min!);
    }
    if (filtros.responsavel_id) list = list.filter(p => p.responsavel_id === filtros.responsavel_id);
    if (filtros.apenas_consentimento) {
      list = canal === "email" ? list.filter(p => p.consentimento_email) : list.filter(p => p.consentimento_whatsapp);
    }
    if (filtros.tem_email) list = list.filter(p => !!p.email_principal);
    if (filtros.tem_telefone) list = list.filter(p => !!p.telefone || !!p.whatsapp);
    if (filtros.tipo) list = list.filter(p => p.tipo === filtros.tipo);

    // Campaign-based segmentation filters
    if (campaignRecipients) {
      const recipientProspectIds = new Set(campaignRecipients.map(r => r.prospect_id));
      const openedProspectIds = new Set(campaignRecipients.filter(r => r.opened_at).map(r => r.prospect_id));

      if (filtros.excluir_campanha_id) {
        list = list.filter(p => !recipientProspectIds.has(p.id));
      }
      if (filtros.apenas_abriu_campanha_id) {
        list = list.filter(p => openedProspectIds.has(p.id));
      }
      if (filtros.nao_abriu_campanha_id) {
        list = list.filter(p => recipientProspectIds.has(p.id) && !openedProspectIds.has(p.id));
      }
    }

    // Email engagement filters (aggregated across all campaigns)
    if (canal === "email" && engagementMap && filtros.engaj_comportamento && filtros.engaj_comportamento !== "qualquer") {
      list = list.filter(p => {
        const e = engagementMap.get(p.id);
        const aberturas = e?.total_aberturas || 0;
        const cliques = e?.total_cliques || 0;
        const recebidos = e?.total_emails || 0;
        if ((filtros.engaj_min_aberturas || 0) > aberturas) return false;
        if ((filtros.engaj_min_cliques || 0) > cliques) return false;
        switch (filtros.engaj_comportamento) {
          case "abriu": return aberturas > 0;
          case "clicou": return cliques > 0;
          case "engajou": return aberturas > 0 && cliques > 0;
          case "nao_abriu": return recebidos > 0 && aberturas === 0;
          case "nunca_recebeu": return recebidos === 0;
          default: return true;
        }
      });
    }
    if (canal === "email" && engagementMap && filtros.excluir_bounced) {
      list = list.filter(p => {
        const e = engagementMap.get(p.id);
        return !e || (!e.bounced && !e.complained);
      });
    }

    // Sort
    list.sort((a, b) => {
      let va = "", vb = "";
      if (sortKey === "nome") { va = a.nome_razao || ""; vb = b.nome_razao || ""; }
      else if (sortKey === "empresa") { va = a.nome_fantasia || a.nome_razao || ""; vb = b.nome_fantasia || b.nome_razao || ""; }
      else { va = a.created_at || ""; vb = b.created_at || ""; }
      const cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [prospects, search, filtros, sortKey, sortDir, canal, campaignRecipients]);

  const totalPages = Math.max(1, Math.ceil(filteredProspects.length / PAGE_SIZE));
  const pagedProspects = filteredProspects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const clearFilters = () => {
    onFiltrosChange({});
    setSearch("");
    setPage(1);
  };

  const hasActiveFilters = !!(
    filtros.status_qualificacao?.length || filtros.segmento || filtros.estado || filtros.cidade ||
    filtros.origem_contato || filtros.origem_lead || filtros.tags?.length || (filtros.score_min && filtros.score_min > 0) ||
    filtros.responsavel_id || filtros.apenas_consentimento || filtros.tem_email || filtros.tem_telefone || filtros.tipo ||
    filtros.excluir_campanha_id || filtros.apenas_abriu_campanha_id || filtros.nao_abriu_campanha_id ||
    (filtros.engaj_comportamento && filtros.engaj_comportamento !== "qualquer") ||
    (filtros.engaj_min_aberturas && filtros.engaj_min_aberturas > 0) ||
    (filtros.engaj_min_cliques && filtros.engaj_min_cliques > 0)
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const hasContact = (p: any) => canal === "email" ? (p.email_principal && !p.optout_email) : (p.whatsapp && p.whatsapp_status !== "invalido" && !p.optout_whatsapp);

  const selectAllVisible = () => {
    const validIds = pagedProspects.filter(hasContact).map(p => p.id);
    const merged = [...new Set([...selectedProspectIds, ...validIds])];
    onSelectedProspectIdsChange(merged);
  };

  const selectAllFiltered = () => {
    const validIds = filteredProspects.filter(hasContact).map(p => p.id);
    onSelectedProspectIdsChange(validIds);
  };

  return (
    <>
      <div className="flex flex-col h-[520px]">
        {/* Top bar */}
        <div className="flex flex-col gap-2 pb-3 border-b border-border mb-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, empresa, email ou telefone..."
                className="pl-9 h-10"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <Button
              variant={showFilters ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-3.5 w-3.5" />
              Filtros
              {hasActiveFilters && <span className="ml-1 h-2 w-2 rounded-full bg-primary" />}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={clearFilters}>
                <X className="h-3 w-3 mr-1" /> Limpar
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {filteredProspects.length === (prospects?.length ?? 0) && !search && !hasActiveFilters
                ? `${totalProspectsCount ?? filteredProspects.length} leads no total`
                : `${filteredProspects.length} de ${totalProspectsCount ?? prospects?.length ?? 0} leads`}
            </span>
            <div className="flex items-center gap-3">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-auto">
                <TabsList className="h-7 p-0.5">
                  <TabsTrigger value="individual" className="h-6 text-xs px-2 gap-1"><UserCheck className="h-3 w-3" />Individual</TabsTrigger>
                  <TabsTrigger value="listas" className="h-6 text-xs px-2 gap-1"><Users className="h-3 w-3" />Listas{importedLists.length > 0 ? ` (${importedLists.length})` : ""}</TabsTrigger>
                  <TabsTrigger value="grupos" className="h-6 text-xs px-2 gap-1"><Users className="h-3 w-3" />Grupos</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>

        {activeTab === "individual" ? (
          <div className="flex flex-1 gap-3 min-h-0">
            {/* Left filter panel */}
            {showFilters && (
              <ScrollArea className="w-[220px] shrink-0 border rounded-lg p-3 bg-muted/20">
                <div className="space-y-4 pr-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</Label>
                    {["novo", "em_qualificacao", "qualificado", "desqualificado"].map(s => (
                      <label key={s} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          className="h-3.5 w-3.5"
                          checked={filtros.status_qualificacao?.includes(s)}
                          onCheckedChange={(c) => {
                            const curr = filtros.status_qualificacao || [];
                            onFiltrosChange({ ...filtros, status_qualificacao: c ? [...curr, s] : curr.filter(x => x !== s) });
                            setPage(1);
                          }}
                        />
                        <span className="text-xs capitalize">{s.replace("_", " ")}</span>
                      </label>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contato</Label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox className="h-3.5 w-3.5" checked={filtros.tem_email || false} onCheckedChange={(c) => { onFiltrosChange({ ...filtros, tem_email: !!c }); setPage(1); }} />
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs">Com email</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox className="h-3.5 w-3.5" checked={filtros.tem_telefone || false} onCheckedChange={(c) => { onFiltrosChange({ ...filtros, tem_telefone: !!c }); setPage(1); }} />
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs">Com telefone</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox className="h-3.5 w-3.5" checked={filtros.apenas_consentimento || false} onCheckedChange={(c) => { onFiltrosChange({ ...filtros, apenas_consentimento: !!c }); setPage(1); }} />
                      <span className="text-xs">Com consentimento</span>
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo</Label>
                    <Select value={filtros.tipo || "__all__"} onValueChange={(v) => { onFiltrosChange({ ...filtros, tipo: v === "__all__" ? undefined : v }); setPage(1); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos</SelectItem>
                        <SelectItem value="empresa">Empresa</SelectItem>
                        <SelectItem value="pessoa">Pessoa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Segmento</Label>
                    <Select value={filtros.segmento || "__all__"} onValueChange={(v) => { onFiltrosChange({ ...filtros, segmento: v === "__all__" ? undefined : v }); setPage(1); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos</SelectItem>
                        {distinctValues.segmentos.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estado</Label>
                    <Select value={filtros.estado || "__all__"} onValueChange={(v) => { onFiltrosChange({ ...filtros, estado: v === "__all__" ? undefined : v }); setPage(1); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos</SelectItem>
                        {distinctValues.estados.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cidade</Label>
                    <Input
                      placeholder="Filtrar cidade..."
                      className="h-8 text-xs"
                      value={filtros.cidade || ""}
                      onChange={(e) => { onFiltrosChange({ ...filtros, cidade: e.target.value || undefined }); setPage(1); }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Responsável</Label>
                    <Select value={filtros.responsavel_id || "__all__"} onValueChange={(v) => { onFiltrosChange({ ...filtros, responsavel_id: v === "__all__" ? undefined : v }); setPage(1); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos</SelectItem>
                        {companyProfiles?.map(p => <SelectItem key={p.id} value={p.id}>{p.nome || p.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Score mín: {filtros.score_min || 0}</Label>
                    <Slider
                      value={[filtros.score_min || 0]}
                      min={0} max={100} step={5}
                      onValueChange={([v]) => { onFiltrosChange({ ...filtros, score_min: v }); setPage(1); }}
                    />
                  </div>

                  {distinctValues.tags.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tags</Label>
                      <div className="flex flex-wrap gap-1">
                        {distinctValues.tags.map(tag => {
                          const sel = filtros.tags?.includes(tag);
                          return (
                            <Badge
                              key={tag}
                              variant={sel ? "default" : "outline"}
                              className="cursor-pointer text-[10px] px-1.5 py-0"
                              onClick={() => {
                                const curr = filtros.tags || [];
                                onFiltrosChange({ ...filtros, tags: sel ? curr.filter(t => t !== tag) : [...curr, tag] });
                                setPage(1);
                              }}
                            >
                              {tag}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Email engagement filters (aggregate across all campaigns) */}
                  {canal === "email" && (
                    <div className="space-y-2 border-t border-border pt-3">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Flame className="h-3 w-3 text-orange-500" />
                        Engajamento de Email
                      </Label>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">Comportamento</Label>
                        <Select
                          value={filtros.engaj_comportamento || "qualquer"}
                          onValueChange={(v) => {
                            onFiltrosChange({ ...filtros, engaj_comportamento: v === "qualquer" ? undefined : (v as any) });
                            setPage(1);
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="qualquer">Qualquer</SelectItem>
                            <SelectItem value="abriu">📩 Abriu pelo menos 1</SelectItem>
                            <SelectItem value="clicou">🖱️ Clicou em link</SelectItem>
                            <SelectItem value="engajou">🔥 Abriu E clicou</SelectItem>
                            <SelectItem value="nao_abriu">🙈 Recebeu mas não abriu</SelectItem>
                            <SelectItem value="nunca_recebeu">🆕 Nunca recebeu email</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">Janela</Label>
                        <Select
                          value={String(filtros.engaj_janela_dias ?? 90)}
                          onValueChange={(v) => { onFiltrosChange({ ...filtros, engaj_janela_dias: parseInt(v, 10) }); setPage(1); }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="7">Últimos 7 dias</SelectItem>
                            <SelectItem value="30">Últimos 30 dias</SelectItem>
                            <SelectItem value="90">Últimos 90 dias</SelectItem>
                            <SelectItem value="180">Últimos 180 dias</SelectItem>
                            <SelectItem value="0">Todos os tempos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">Mín. aberturas: {filtros.engaj_min_aberturas || 0}</Label>
                        <Slider
                          value={[filtros.engaj_min_aberturas || 0]}
                          min={0} max={10} step={1}
                          onValueChange={([v]) => { onFiltrosChange({ ...filtros, engaj_min_aberturas: v }); setPage(1); }}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">Mín. cliques: {filtros.engaj_min_cliques || 0}</Label>
                        <Slider
                          value={[filtros.engaj_min_cliques || 0]}
                          min={0} max={5} step={1}
                          onValueChange={([v]) => { onFiltrosChange({ ...filtros, engaj_min_cliques: v }); setPage(1); }}
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          className="h-3.5 w-3.5"
                          checked={filtros.excluir_bounced ?? true}
                          onCheckedChange={(c) => { onFiltrosChange({ ...filtros, excluir_bounced: !!c }); setPage(1); }}
                        />
                        <AlertOctagon className="h-3 w-3 text-destructive" />
                        <span className="text-xs">Excluir bounced/spam</span>
                      </label>
                    </div>
                  )}

                  {/* Campaign segmentation filters */}
                  {pastCampaigns && pastCampaigns.length > 0 && (
                    <div className="space-y-2 border-t border-border pt-3">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Histórico de Campanhas</Label>
                      
                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">Excluir quem recebeu</Label>
                        <Select 
                          value={filtros.excluir_campanha_id || "__none__"} 
                          onValueChange={(v) => { 
                            onFiltrosChange({ ...filtros, excluir_campanha_id: v === "__none__" ? undefined : v, apenas_abriu_campanha_id: undefined, nao_abriu_campanha_id: undefined }); 
                            setPage(1); 
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nenhuma</SelectItem>
                            {pastCampaigns.map(c => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.canal === "email" ? "📧" : "📱"} {c.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">Apenas quem abriu</Label>
                        <Select 
                          value={filtros.apenas_abriu_campanha_id || "__none__"} 
                          onValueChange={(v) => { 
                            onFiltrosChange({ ...filtros, apenas_abriu_campanha_id: v === "__none__" ? undefined : v, excluir_campanha_id: undefined, nao_abriu_campanha_id: undefined }); 
                            setPage(1); 
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nenhuma</SelectItem>
                            {pastCampaigns.filter(c => c.canal === "email").map(c => (
                              <SelectItem key={c.id} value={c.id}>📧 {c.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">Quem NÃO abriu</Label>
                        <Select 
                          value={filtros.nao_abriu_campanha_id || "__none__"} 
                          onValueChange={(v) => { 
                            onFiltrosChange({ ...filtros, nao_abriu_campanha_id: v === "__none__" ? undefined : v, excluir_campanha_id: undefined, apenas_abriu_campanha_id: undefined }); 
                            setPage(1); 
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nenhuma</SelectItem>
                            {pastCampaigns.filter(c => c.canal === "email").map(c => (
                              <SelectItem key={c.id} value={c.id}>📧 {c.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}

            {/* Right: lead list */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Sort bar */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground">Ordenar:</span>
                {([["nome", "Nome"], ["empresa", "Empresa"], ["created_at", "Data"]] as [SortKey, string][]).map(([key, label]) => (
                  <Button
                    key={key}
                    variant={sortKey === key ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 text-xs px-2 gap-1"
                    onClick={() => toggleSort(key)}
                  >
                    {label}
                    {sortKey === key && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                  </Button>
                ))}
              </div>

              <ScrollArea className="flex-1">
                <div className="space-y-1.5 pr-2">
                  {pagedProspects.map(p => {
                    const isSelected = selectedProspectIds.includes(p.id);
                    const valid = hasContact(p);
                    const noPhone = !p.whatsapp;
                    const noEmail = !p.email_principal;
                    const tags = (p.tags as string[]) || [];

                    return (
                      <div
                        key={p.id}
                        className={`
                          group flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer
                          ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border/50 hover:border-primary/30 hover:bg-muted/30"}
                          ${!valid ? "opacity-50" : ""}
                        `}
                        onClick={() => {
                          if (!valid) return;
                          onSelectedProspectIdsChange(
                            isSelected ? selectedProspectIds.filter(id => id !== p.id) : [...selectedProspectIds, p.id]
                          );
                        }}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={!valid}
                          className="mt-0.5 h-4.5 w-4.5"
                          onCheckedChange={(checked) => {
                            onSelectedProspectIdsChange(
                              checked ? [...selectedProspectIds, p.id] : selectedProspectIds.filter(id => id !== p.id)
                            );
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium text-sm truncate">{p.nome_razao}</span>
                            {canal === "email" && engagementMap?.get(p.id) && (() => {
                              const e = engagementMap.get(p.id)!;
                              return (
                                <span className="flex items-center gap-1">
                                  {e.engajamento_score >= 70 && (
                                    <span title={`Engajado (${e.engajamento_score})`}><Flame className="h-3 w-3 text-orange-500" /></span>
                                  )}
                                  {e.total_cliques > 0 && e.engajamento_score < 70 && (
                                    <span title={`${e.total_cliques} clique(s)`}><MousePointerClick className="h-3 w-3 text-primary" /></span>
                                  )}
                                  {e.total_aberturas > 0 && e.total_cliques === 0 && (
                                    <span title={`${e.total_aberturas} abertura(s)`}><Eye className="h-3 w-3 text-blue-500" /></span>
                                  )}
                                  {(e.bounced || e.complained) && (
                                    <span title={e.bounced ? "Bounced" : "Marcou como spam"}><AlertOctagon className="h-3 w-3 text-destructive" /></span>
                                  )}
                                </span>
                              );
                            })()}
                            {!valid && canal === "whatsapp" && noPhone && (
                              <span className="text-destructive" title="Sem telefone">
                                <AlertTriangle className="h-3 w-3" />
                              </span>
                            )}
                            {!valid && canal === "email" && noEmail && (
                              <span className="text-destructive" title="Sem email">
                                <AlertTriangle className="h-3 w-3" />
                              </span>
                            )}
                          </div>

                          {p.nome_fantasia && p.nome_fantasia !== p.nome_razao && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                              <Building2 className="h-3 w-3 shrink-0" />
                              <span className="truncate">{p.nome_fantasia}</span>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            {(p.telefone || p.whatsapp) && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3 shrink-0" />
                                {p.whatsapp || p.telefone}
                              </span>
                            )}
                            {p.email_principal && (
                              <span className="flex items-center gap-1 truncate max-w-[200px]">
                                <Mail className="h-3 w-3 shrink-0" />
                                {p.email_principal}
                              </span>
                            )}
                          </div>

                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tags.slice(0, 3).map(t => (
                                <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 h-4">{t}</Badge>
                              ))}
                              {tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {(p.status_qualificacao || "novo").replace("_", " ")}
                          </Badge>
                          {p.score !== null && p.score !== undefined && p.score > 0 && (
                            <span className="text-[10px] text-muted-foreground">Score: {p.score}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {filteredProspects.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhum lead encontrado com esses filtros.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2 mt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    Pág. {page} de {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === "listas" ? (
          /* Listas importadas tab */
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm text-muted-foreground">
                Listas criadas a partir de importações de CSV. Selecione para enviar a campanha para a lista inteira.
              </p>
            </div>
            {importedLists.length > 0 ? (
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-2">
                  {importedLists.map(lista => {
                    const allSelected = lista.prospectIds.every(id => selectedProspectIds.includes(id));
                    const someSelected = !allSelected && lista.prospectIds.some(id => selectedProspectIds.includes(id));
                    return (
                      <Card key={lista.tag} className={`transition-all ${allSelected ? "border-primary ring-1 ring-primary" : ""}`}>
                        <CardContent className="p-3 flex items-center gap-3">
                          <Checkbox
                            checked={allSelected ? true : someSelected ? "indeterminate" : false}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                const merged = Array.from(new Set([...selectedProspectIds, ...lista.prospectIds]));
                                onSelectedProspectIdsChange(merged);
                              } else {
                                const remaining = selectedProspectIds.filter(id => !lista.prospectIds.includes(id));
                                onSelectedProspectIdsChange(remaining);
                              }
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{lista.label}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {lista.eligibleCount} elegíveis para {canal === "email" ? "e-mail" : "WhatsApp"} · {lista.prospectIds.length} prospects no total
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-xs">{lista.eligibleCount}</Badge>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma lista importada ainda.</p>
                <p className="text-xs mt-1">Importe um CSV na página de Prospects para criar uma lista.</p>
              </div>
            )}
          </div>
        ) : (
          /* Grupos tab */
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm text-muted-foreground">Selecione grupos de envio:</p>
              <Button variant="outline" size="sm" onClick={() => setShowCreateGroup(true)}>
                <Plus className="h-3 w-3 mr-1" />Criar Grupo
              </Button>
            </div>
            {sendGroups && sendGroups.length > 0 ? (
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-2">
                  {sendGroups.map(group => {
                    const isSelected = selectedGroupIds.includes(group.id);
                    return (
                      <Card key={group.id} className={`transition-all ${isSelected ? "border-primary ring-1 ring-primary" : ""}`}>
                        <CardContent className="p-3 flex items-center gap-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              onSelectedGroupIdsChange(
                                checked ? [...selectedGroupIds, group.id] : selectedGroupIds.filter(id => id !== group.id)
                              );
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{group.nome}</p>
                            {group.descricao && <p className="text-xs text-muted-foreground truncate">{group.descricao}</p>}
                          </div>
                          <Badge variant="secondary" className="text-xs">{(group.prospect_ids || []).length} prospects</Badge>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); deleteSendGroup.mutate(group.id); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum grupo criado ainda.</p>
              </div>
            )}
          </div>
        )}

        {/* Bottom selection bar */}
        {selectedProspectIds.length > 0 && (
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-border bg-primary/5 -mx-1 px-3 py-2 rounded-lg">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{totalRecipients} destinatários no total</span>
              <span className="text-xs text-muted-foreground">({selectedProspectIds.length} individuais)</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllFiltered}>
                Selecionar todos ({filteredProspects.filter(hasContact).length})
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => onSelectedProspectIdsChange([])}>
                Limpar seleção
              </Button>
            </div>
          </div>
        )}

        {selectedProspectIds.length === 0 && activeTab === "individual" && (
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">{totalRecipients} destinatários no total</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllVisible}>
                Selecionar página
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllFiltered}>
                Selecionar todos ({filteredProspects.filter(hasContact).length})
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Group Dialog */}
      <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
        <DialogContent className="sm:max-w-2xl z-[60] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Criar Grupo de Envio</DialogTitle>
            <DialogDescription>Selecione os prospects que farão parte deste grupo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Grupo *</Label>
                <Input placeholder="Ex: VIPs" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Descrição (opcional)</Label>
                <Input placeholder="Ex: Clientes premium região sul" value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              {(() => {
                const filtered = prospects?.filter(p => {
                  if (!groupProspectSearch) return true;
                  const q = groupProspectSearch.toLowerCase();
                  return p.nome_razao?.toLowerCase().includes(q) || p.email_principal?.toLowerCase().includes(q) || (p.whatsapp || p.telefone || "")?.toLowerCase().includes(q);
                }) ?? [];
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <Label>Prospects — {newGroupProspectIds.length} selecionados de {filtered.length} exibidos</Label>
                      <div className="flex gap-2">
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setNewGroupProspectIds(filtered.map(p => p.id))}>Selecionar todos</Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setNewGroupProspectIds([])} disabled={newGroupProspectIds.length === 0}>Limpar</Button>
                      </div>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Buscar..." className="pl-9" value={groupProspectSearch} onChange={(e) => setGroupProspectSearch(e.target.value)} />
                    </div>
                    <ScrollArea className="h-[350px] border rounded-md">
                      <div className="p-1">
                        {filtered.map(p => (
                          <label key={p.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 rounded-md transition-colors">
                            <Checkbox checked={newGroupProspectIds.includes(p.id)} onCheckedChange={(checked) => setNewGroupProspectIds(prev => checked ? [...prev, p.id] : prev.filter(id => id !== p.id))} />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate block">{p.nome_razao}</span>
                              <span className="text-xs text-muted-foreground truncate block">{[p.email_principal, p.telefone_whatsapp].filter(Boolean).join(" · ") || "Sem contato"}</span>
                            </div>
                            {p.status_qualificacao && <Badge variant="secondary" className="text-[10px] shrink-0">{p.status_qualificacao}</Badge>}
                          </label>
                        ))}
                        {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum prospect encontrado.</p>}
                      </div>
                    </ScrollArea>
                  </>
                );
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateGroup(false)}>Cancelar</Button>
            <Button
              disabled={!newGroupName.trim() || newGroupProspectIds.length === 0 || createSendGroup.isPending}
              onClick={async () => {
                try {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) return;
                  const { data: profile } = await supabase.from("profiles").select("empresa_id").eq("id", user.id).single();
                  if (!profile?.empresa_id) return;
                  await createSendGroup.mutateAsync({ empresa_id: profile.empresa_id, nome: newGroupName, descricao: newGroupDesc || undefined, prospect_ids: newGroupProspectIds, created_by: user.id });
                  toast.success("Grupo criado!");
                  setShowCreateGroup(false);
                  setNewGroupName("");
                  setNewGroupDesc("");
                  setNewGroupProspectIds([]);
                  setGroupProspectSearch("");
                } catch (err: any) {
                  toast.error(err.message || "Erro ao criar grupo");
                }
              }}
            >
              {createSendGroup.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Criar Grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
