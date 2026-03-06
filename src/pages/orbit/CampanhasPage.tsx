import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { CampaignWizard } from "@/components/orbit/CampaignWizard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, MessageSquare, Mail, Loader2, Play, Pause, X, CheckCircle, Send, Trash2, Info } from "lucide-react";
import { useOrbitCampaigns, useUpdateCampaign, useDeleteCampaign } from "@/hooks/useOrbitCampaigns";
import { supabase } from "@/integrations/supabase/client";
import { handleApiResponse } from "@/lib/api-envelope";
import { format } from "date-fns";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  pendente_aprovacao: { label: "Aguardando Aprovação", className: "bg-amber-500/20 text-amber-500" },
  aprovada: { label: "Aprovada", className: "bg-green-500/20 text-green-500" },
  reprovada: { label: "Reprovada", className: "bg-red-500/20 text-red-500" },
  agendada: { label: "Agendada", className: "bg-blue-500/20 text-blue-400" },
  enviando: { label: "Enviando", className: "bg-purple-500/20 text-purple-400" },
  concluida: { label: "Concluída", className: "bg-green-500/20 text-green-400" },
  pausada: { label: "Pausada", className: "bg-orange-500/20 text-orange-400" },
  pausada_por_limite: { label: "Limite Diário Atingido", className: "bg-amber-600/20 text-amber-500" },
  cancelada: { label: "Cancelada", className: "bg-red-500/20 text-red-400" },
};

export default function CampanhasPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  const { data: campaigns, isLoading, refetch } = useOrbitCampaigns({ status: statusFilter });
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();

  // Fetch recipient counts per campaign
  const campaignIds = campaigns?.map(c => c.id) || [];
  const { data: recipientCounts } = useQuery({
    queryKey: ["campaign_recipient_counts", campaignIds],
    queryFn: async () => {
      if (!campaignIds.length) return {};
      const { data, error } = await supabase
        .from("orbit_campaign_recipients")
        .select("campaign_id, status")
        .in("campaign_id", campaignIds);
      if (error) throw error;
      const counts: Record<string, { total: number; pendente: number }> = {};
      (data || []).forEach(r => {
        if (!r.campaign_id) return;
        if (!counts[r.campaign_id]) counts[r.campaign_id] = { total: 0, pendente: 0 };
        counts[r.campaign_id].total++;
        if (r.status === "pendente") counts[r.campaign_id].pendente++;
      });
      return counts;
    },
    enabled: campaignIds.length > 0,
  });

  const handleRequestApproval = async (campaignId: string) => {
    try {
      setActionLoading(campaignId);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const response = await supabase.functions.invoke("request-campaign-approval", {
        body: { campaign_id: campaignId, user_id: user.id }
      });
      handleApiResponse(response);
      toast.success("Solicitação de aprovação enviada!");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao solicitar aprovação");
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (campaignId: string) => {
    try {
      setActionLoading(campaignId);
      const { data: { user } } = await supabase.auth.getUser();
      await updateCampaign.mutateAsync({
        id: campaignId,
        aprovacao_status: "aprovada",
        aprovado_por: user?.id,
        aprovado_em: new Date().toISOString(),
        status: "aprovada"
      });
      const { data: campaign } = await supabase
        .from("orbit_campaigns")
        .select("empresa_id")
        .eq("id", campaignId)
        .single();
      if (campaign) {
        await supabase.from("orbit_campaign_approvals").insert({
          campaign_id: campaignId,
          empresa_id: campaign.empresa_id,
          acao: "aprovada",
          user_id: user?.id
        });
      }
      toast.success("Campanha aprovada!");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao aprovar");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (campaignId: string) => {
    try {
      setActionLoading(campaignId);
      const { data: { user } } = await supabase.auth.getUser();
      await updateCampaign.mutateAsync({
        id: campaignId,
        aprovacao_status: "reprovada",
        status: "reprovada"
      });
      const { data: campaign } = await supabase
        .from("orbit_campaigns")
        .select("empresa_id")
        .eq("id", campaignId)
        .single();
      if (campaign) {
        await supabase.from("orbit_campaign_approvals").insert({
          campaign_id: campaignId,
          empresa_id: campaign.empresa_id,
          acao: "reprovada",
          user_id: user?.id
        });
      }
      toast.success("Campanha reprovada");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao reprovar");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSend = async (campaignId: string) => {
    try {
      setActionLoading(campaignId);
      const response = await supabase.functions.invoke("send-orbit-campaign", {
        body: { campaign_id: campaignId }
      });
      const result = handleApiResponse<{ enviados: number; validados_enviados: number; ignorados_sem_numero: number; ignorados_sem_whatsapp: number; ignorados_whatsapp_invalido: number; falhas: number; pausada_por_limite?: boolean; remaining_pending?: number }>(response);
      const parts = [
        `✅ Enviados: ${result.enviados}`,
        result.validados_enviados ? `🔍 Validados+Enviados: ${result.validados_enviados}` : null,
        result.ignorados_sem_numero ? `📵 Sem número: ${result.ignorados_sem_numero}` : null,
        result.ignorados_sem_whatsapp ? `⚠️ Sem WhatsApp: ${result.ignorados_sem_whatsapp}` : null,
        result.ignorados_whatsapp_invalido ? `❌ Inválidos (cache): ${result.ignorados_whatsapp_invalido}` : null,
        result.falhas ? `🔴 Erros: ${result.falhas}` : null,
        result.pausada_por_limite ? `⏸️ Limite diário atingido (${result.remaining_pending} pendentes)` : null,
      ].filter(Boolean);
      toast.success(parts.join(" | "));
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar campanha");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (campaignId: string) => {
    try {
      await updateCampaign.mutateAsync({ id: campaignId, status: "pausada" });
      toast.success("Campanha pausada");
      refetch();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCancel = async (campaignId: string) => {
    try {
      await updateCampaign.mutateAsync({ id: campaignId, status: "cancelada" });
      toast.success("Campanha cancelada");
      refetch();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.id) return;
    try {
      await deleteCampaign.mutateAsync(deleteDialog.id);
      toast.success("Campanha excluída");
      setDeleteDialog({ open: false, id: null });
      refetch();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <OrbitLayout>
      <PageHeader
        title="Campanhas"
        description="Gerencie campanhas de email e WhatsApp"
        action={
          <Button size="sm" onClick={() => setWizardOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Nova Campanha
          </Button>
        }
      />

      <div className="flex gap-4 mb-6">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="pendente_aprovacao">Aguardando Aprovação</SelectItem>
            <SelectItem value="aprovada">Aprovada</SelectItem>
            <SelectItem value="enviando">Enviando</SelectItem>
            <SelectItem value="concluida">Concluída</SelectItem>
            <SelectItem value="pausada">Pausada</SelectItem>
            <SelectItem value="pausada_por_limite">Limite Diário</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : campaigns?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nenhuma campanha encontrada</p>
          <Button variant="link" onClick={() => setWizardOpen(true)}>
            Criar primeira campanha
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns?.map((c) => {
            const status = c.status || "rascunho";
            const loading = actionLoading === c.id;
            const counts = recipientCounts?.[c.id];
            const totalRecipients = counts?.total || c.total_destinatarios || 0;
            const pendingRecipients = counts?.pendente || 0;
            const hasTemplate = !!c.template_id;

            return (
              <div key={c.id} className="bg-card border rounded-lg p-6">
                {/* Header */}
                <div className="flex justify-between mb-4">
                  <div className="flex gap-3">
                    <div className={`p-2 rounded-lg ${c.canal === "whatsapp" ? "bg-green-500/20" : "bg-blue-500/20"}`}>
                      {c.canal === "whatsapp" ? (
                        <MessageSquare className="h-5 w-5 text-green-500" />
                      ) : (
                        <Mail className="h-5 w-5 text-blue-500" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold">{c.nome}</h3>
                      <p className="text-sm text-muted-foreground">
                        Criada em {c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy HH:mm") : "-"}
                        {c.template && ` • Template: ${(c.template as any).nome}`}
                      </p>
                    </div>
                  </div>
                  <Badge className={statusConfig[status]?.className}>
                    {statusConfig[status]?.label}
                  </Badge>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-5 gap-4 mb-4">
                  {[
                    ["Destinatários", totalRecipients],
                    ["Enviados", c.enviados],
                    ["Aberturas", c.aberturas],
                    ["Cliques", c.cliques],
                    ["Respostas", c.respostas]
                  ].map(([label, value]) => (
                    <div key={String(label)} className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-lg font-semibold">{value || 0}</p>
                    </div>
                  ))}
                </div>

                {c.agendada_para && (
                  <p className="text-sm text-muted-foreground mb-4">
                    📅 Agendada para: {format(new Date(c.agendada_para), "dd/MM/yyyy 'às' HH:mm")}
                  </p>
                )}

                {/* Action buttons — always visible */}
                <CampaignActions
                  status={status}
                  campaignId={c.id}
                  loading={loading}
                  totalRecipients={totalRecipients}
                  pendingRecipients={pendingRecipients}
                  hasTemplate={hasTemplate}
                  aprovacaoStatus={c.aprovacao_status}
                  onRequestApproval={handleRequestApproval}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onSend={handleSend}
                  onPause={handlePause}
                  onCancel={handleCancel}
                  onDelete={(id) => setDeleteDialog({ open: true, id })}
                />
              </div>
            );
          })}
        </div>
      )}

      <CampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} />

      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, id: open ? deleteDialog.id : null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Campanha</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta campanha? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </OrbitLayout>
  );
}

/* ── Extracted action buttons component ── */

interface CampaignActionsProps {
  status: string;
  campaignId: string;
  loading: boolean;
  totalRecipients: number;
  pendingRecipients: number;
  hasTemplate: boolean;
  aprovacaoStatus: string | null;
  onRequestApproval: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSend: (id: string) => void;
  onPause: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}

function CampaignActions({
  status, campaignId, loading, totalRecipients, pendingRecipients,
  hasTemplate, aprovacaoStatus,
  onRequestApproval, onApprove, onReject, onSend, onPause, onCancel, onDelete,
}: CampaignActionsProps) {
  const canRequestApproval = status === "rascunho" && hasTemplate && totalRecipients > 0;
  const canApprove = status === "pendente_aprovacao";
  const canSend = (status === "aprovada" || aprovacaoStatus === "aprovada") && pendingRecipients > 0;
  const canResume = (status === "pausada" || status === "pausada_por_limite") && pendingRecipients > 0;
  const canPause = status === "enviando";
  const canCancel = !["concluida", "cancelada"].includes(status);
  const canDelete = status === "rascunho";

  const hasAnyAction = canRequestApproval || canApprove || canSend || canResume || canPause || canCancel || canDelete;

  // Debug info — helps diagnose when no buttons appear
  const showDebug = !hasAnyAction && !["concluida", "cancelada"].includes(status);

  return (
    <div className="border-t pt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {/* Primary actions */}
        {canRequestApproval && (
          <Button size="sm" onClick={() => onRequestApproval(campaignId)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Solicitar Aprovação
          </Button>
        )}

        {canApprove && (
          <>
            <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => onApprove(campaignId)} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Aprovar para Envio
            </Button>
            <Button size="sm" variant="destructive" onClick={() => onReject(campaignId)} disabled={loading}>
              <X className="h-4 w-4 mr-2" />Reprovar
            </Button>
          </>
        )}

        {canSend && (
          <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => onSend(campaignId)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Enviar Campanha ({pendingRecipients} pendentes)
          </Button>
        )}

        {canResume && (
          <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => onSend(campaignId)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {status === "pausada_por_limite" ? "Retomar (Limite Resetado)" : "Retomar Envio"} ({pendingRecipients} pendentes)
          </Button>
        )}

        {canPause && (
          <Button size="sm" variant="outline" onClick={() => onPause(campaignId)} disabled={loading}>
            <Pause className="h-4 w-4 mr-2" />Pausar
          </Button>
        )}

        {/* Secondary actions */}
        {canCancel && (
          <Button size="sm" variant="outline" className="text-destructive border-destructive/50 hover:bg-destructive/10" onClick={() => onCancel(campaignId)} disabled={loading}>
            <X className="h-4 w-4 mr-2" />Cancelar
          </Button>
        )}

        {canDelete && (
          <Button size="sm" variant="outline" className="text-destructive border-destructive/50 hover:bg-destructive/10" onClick={() => onDelete(campaignId)} disabled={loading}>
            <Trash2 className="h-4 w-4 mr-2" />Excluir
          </Button>
        )}

        {/* Rascunho without template or recipients — show guidance */}
        {status === "rascunho" && !canRequestApproval && (
          <div className="flex items-center gap-2 text-sm text-amber-500">
            <Info className="h-4 w-4" />
            {!hasTemplate && "Configure um template para solicitar aprovação. "}
            {totalRecipients === 0 && "Nenhum destinatário configurado."}
          </div>
        )}
      </div>

      {/* Debug panel — shown when no actions available on an active campaign */}
      {showDebug && (
        <div className="bg-muted/50 border border-dashed rounded-lg p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium flex items-center gap-1"><Info className="h-3 w-3" /> Diagnóstico da campanha</p>
          <p>Status: <span className="font-mono">{status}</span> | Aprovação: <span className="font-mono">{aprovacaoStatus || "n/a"}</span></p>
          <p>Destinatários: {totalRecipients} total, {pendingRecipients} pendentes</p>
          <p>Template: {hasTemplate ? "✅ configurado" : "❌ não configurado"}</p>
          {status === "aprovada" && pendingRecipients === 0 && (
            <p className="text-amber-500">⚠️ Campanha aprovada mas sem destinatários pendentes para envio.</p>
          )}
        </div>
      )}
    </div>
  );
}
