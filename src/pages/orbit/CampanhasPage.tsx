import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { CampaignWizard } from "@/components/orbit/CampaignWizard";
import { CampaignReviewDialog } from "@/components/orbit/CampaignReviewDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, MessageSquare, Mail, Loader2, Play, Pause, X, Send, Trash2, Info, Eye } from "lucide-react";
import { useOrbitCampaigns, useUpdateCampaign, useDeleteCampaign } from "@/hooks/useOrbitCampaigns";
import { supabase } from "@/integrations/supabase/client";
import { handleApiResponse } from "@/lib/api-envelope";
import { format } from "date-fns";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  em_revisao: { label: "Em Revisão", className: "bg-amber-500/20 text-amber-500" },
  aprovada_para_envio: { label: "Aprovada para Envio", className: "bg-green-500/20 text-green-500" },
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
  const [reviewCampaignId, setReviewCampaignId] = useState<string | null>(null);

  const { data: campaigns, isLoading, refetch } = useOrbitCampaigns({ status: statusFilter });
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();

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

  const reviewCampaign = campaigns?.find(c => c.id === reviewCampaignId) || null;

  const handleReview = (campaignId: string) => {
    setReviewCampaignId(campaignId);
    // Update status to em_revisao if still rascunho
    const campaign = campaigns?.find(c => c.id === campaignId);
    if (campaign?.status === "rascunho") {
      updateCampaign.mutate({ id: campaignId, status: "em_revisao" });
    }
  };

  const handleApproveForSend = async (campaignId: string) => {
    try {
      setActionLoading(campaignId);
      const { data: { user } } = await supabase.auth.getUser();
      await updateCampaign.mutateAsync({
        id: campaignId,
        status: "aprovada_para_envio",
        aprovacao_status: "aprovada_para_envio",
        aprovado_por: user?.id,
        aprovado_em: new Date().toISOString(),
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
          acao: "aprovada_para_envio",
          user_id: user?.id,
        });
      }
      toast.success("Campanha aprovada para envio!");
      setReviewCampaignId(null);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao aprovar");
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
            <SelectItem value="em_revisao">Em Revisão</SelectItem>
            <SelectItem value="aprovada_para_envio">Aprovada para Envio</SelectItem>
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
                    {statusConfig[status]?.label || status}
                  </Badge>
                </div>

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

                <CampaignActions
                  status={status}
                  campaignId={c.id}
                  loading={loading}
                  totalRecipients={totalRecipients}
                  pendingRecipients={pendingRecipients}
                  hasTemplate={hasTemplate}
                  onReview={handleReview}
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

      <CampaignReviewDialog
        open={!!reviewCampaignId}
        onOpenChange={(open) => !open && setReviewCampaignId(null)}
        campaign={reviewCampaign}
        recipientCounts={reviewCampaignId ? recipientCounts?.[reviewCampaignId] : undefined}
        onApproveForSend={handleApproveForSend}
        loading={actionLoading === reviewCampaignId}
      />

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

/* ── Campaign action buttons ── */

interface CampaignActionsProps {
  status: string;
  campaignId: string;
  loading: boolean;
  totalRecipients: number;
  pendingRecipients: number;
  hasTemplate: boolean;
  onReview: (id: string) => void;
  onSend: (id: string) => void;
  onPause: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}

function CampaignActions({
  status, campaignId, loading, totalRecipients, pendingRecipients,
  hasTemplate, onReview, onSend, onPause, onCancel, onDelete,
}: CampaignActionsProps) {
  const canReview = ["rascunho", "em_revisao"].includes(status) && hasTemplate && totalRecipients > 0;
  const canSend = status === "aprovada_para_envio" && pendingRecipients > 0;
  const canResume = (status === "enviando" || status === "pausada" || status === "pausada_por_limite") && pendingRecipients > 0;
  const canPause = status === "enviando";
  const canCancel = !["concluida", "cancelada"].includes(status);
  const canDelete = status === "rascunho";

  return (
    <div className="border-t pt-4">
      <div className="flex flex-wrap gap-2">
        {canReview && (
          <Button size="sm" onClick={() => onReview(campaignId)} disabled={loading}>
            <Eye className="h-4 w-4 mr-2" />
            Revisar Campanha
          </Button>
        )}

        {canSend && (
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => onSend(campaignId)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Enviar Campanha ({pendingRecipients} pendentes)
          </Button>
        )}

        {canResume && (
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => onSend(campaignId)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {status === "pausada_por_limite" ? "Retomar (Limite Resetado)" : "Retomar Envio"} ({pendingRecipients} pendentes)
          </Button>
        )}

        {canPause && (
          <Button size="sm" variant="outline" onClick={() => onPause(campaignId)} disabled={loading}>
            <Pause className="h-4 w-4 mr-2" />Pausar
          </Button>
        )}

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

        {status === "rascunho" && !canReview && (
          <div className="flex items-center gap-2 text-sm text-amber-500">
            <Info className="h-4 w-4" />
            {!hasTemplate && "Configure um template para revisar a campanha. "}
            {totalRecipients === 0 && "Nenhum destinatário configurado."}
          </div>
        )}
      </div>
    </div>
  );
}
