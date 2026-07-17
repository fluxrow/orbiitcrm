import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { CampaignReviewDialog } from "@/components/orbit/CampaignReviewDialog";
import { CampaignAnalyticsDialog, type FollowUpAudience } from "@/components/orbit/CampaignAnalyticsDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, MessageSquare, Mail, Loader2, Play, Pause, X, Send, Trash2, Info, Eye, BarChart3 } from "lucide-react";
import { useOrbitCampaigns, useUpdateCampaign, useDeleteCampaign } from "@/hooks/useOrbitCampaigns";
import { supabase } from "@/integrations/supabase/client";
import { handleApiResponse } from "@/lib/api-envelope";
import { format, isPast } from "date-fns";
import { toast } from "sonner";
import { orbitCampaignKeys } from "@/lib/query-keys";
import { usePeAuth } from "@/hooks/usePeAuth";
import { CheckCircle2 } from "lucide-react";

const statusConfig: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  em_revisao: { label: "Em Revisão", className: "bg-amber-500/20 text-amber-500" },
  aprovada_para_envio: { label: "Aprovada para Envio", className: "bg-green-500/20 text-green-500" },
  agendada: { label: "Agendada", className: "bg-blue-500/20 text-blue-400" },
  enviando: { label: "Enviando", className: "bg-purple-500/20 text-purple-400" },
  concluida: { label: "Concluída", className: "bg-green-500/20 text-green-400" },
  falha: { label: "Falhou", className: "bg-red-500/20 text-red-400" },
  pausada: { label: "Pausada", className: "bg-orange-500/20 text-orange-400" },
  pausada_por_limite: { label: "Limite Diário Atingido", className: "bg-amber-600/20 text-amber-500" },
  cancelada: { label: "Cancelada", className: "bg-red-500/20 text-red-400" },
};

export default function CampanhasPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [canalFilter, setCanalFilter] = useState("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [approveDialog, setApproveDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [reviewCampaignId, setReviewCampaignId] = useState<string | null>(null);
  const [analyticsCampaign, setAnalyticsCampaign] = useState<{ id: string; nome: string } | null>(null);
  const { isSuperAdmin } = usePeAuth();

  const { data: campaigns, isLoading, refetch } = useOrbitCampaigns({ status: statusFilter, canal: canalFilter });
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();

  const campaignIds = campaigns?.map(c => c.id) || [];
  const { data: recipientCounts } = useQuery({
    queryKey: orbitCampaignKeys.countsByIds(campaignIds),
    queryFn: async () => {
      if (!campaignIds.length) return {};
      const { data, error } = await supabase.rpc("get_campaign_recipient_counts" as any, {
        p_campaign_ids: campaignIds,
      });
      if (error) throw error;
      const counts: Record<string, { total: number; pendente: number; enviado: number; falhou: number; ignorado: number }> = {};
      ((data as any[]) || []).forEach((r: any) => {
        counts[r.campaign_id] = {
          total: Number(r.total) || 0,
          pendente: Number(r.pendente) || 0,
          enviado: Number(r.enviado) || 0,
          falhou: Number(r.falhou) || 0,
          ignorado: Number(r.ignorado) || 0,
        };
      });
      return counts;
    },
    enabled: campaignIds.length > 0,
  });

  const reviewCampaign = campaigns?.find(c => c.id === reviewCampaignId) || null;

  const queryClient = useQueryClient();

  const handleReview = (campaignId: string) => {
    setReviewCampaignId(campaignId);
    // Update status to em_revisao if still rascunho
    const campaign = campaigns?.find(c => c.id === campaignId);
    if (campaign?.status === "rascunho") {
      updateCampaign.mutate({ id: campaignId, status: "em_revisao" });
    }
    // Force fresh recipient counts when opening the dialog
    queryClient.invalidateQueries({ queryKey: orbitCampaignKeys.counts() });
  };

  const handleApproveForSend = async (campaignId: string) => {
    try {
      setActionLoading(campaignId);
      const { data: { user } } = await supabase.auth.getUser();
      await updateCampaign.mutateAsync({
        id: campaignId,
        status: "aprovada_para_envio",
        aprovacao_status: "aprovada",
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

      // Pre-send validation for email campaigns
      const campaign = campaigns?.find(c => c.id === campaignId);
      if (campaign?.canal === "email") {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          const { data: peUser } = await supabase
            .from("pe_users" as any)
            .select("full_name, email, use_personal_signature")
            .eq("id", user.id)
            .single();

          if ((peUser as any)?.use_personal_signature && !user.email) {
            toast.error("Configure um e-mail válido no perfil para utilizar reply-to personalizado.");
            setActionLoading(null);
            return;
          }
          if (!(peUser as any)?.full_name) {
            toast.error("Configure seu nome no perfil antes de enviar campanhas de e-mail.");
            setActionLoading(null);
            return;
          }
        }
      }

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
      if (result.falhas && result.enviados === 0 && result.validados_enviados === 0) {
        toast.error(parts.join(" | "));
      } else {
        toast.success(parts.join(" | "));
      }
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

  const handleApproveDispatch = async () => {
    if (!approveDialog.id) return;
    const campaignId = approveDialog.id;
    try {
      setActionLoading(campaignId);
      const { data: { user } } = await supabase.auth.getUser();
      // Aprovação sem forçar envio: mantém o status atual (agendada/em_revisao/rascunho)
      // e apenas marca aprovacao_status='aprovada'. O scheduler faz o resto.
      await updateCampaign.mutateAsync({
        id: campaignId,
        aprovacao_status: "aprovada",
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
      toast.success("Disparo aprovado. O scheduler cuidará do envio no próximo tick, se o envio real estiver liberado.");
      setApproveDialog({ open: false, id: null });
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao aprovar disparo");
    } finally {
      setActionLoading(null);
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

  const approveTarget = campaigns?.find((c) => c.id === approveDialog.id) || null;
  const approveAgendaVencida = !!approveTarget?.agendada_para && isPast(new Date(approveTarget.agendada_para));


  return (
    <OrbitLayout>
      <PageHeader
        title="Campanhas"
        description="Gerencie campanhas de email e WhatsApp"
        action={
          <Button size="sm" onClick={() => navigate("nova")}>
            <Plus className="h-4 w-4 mr-2" />Nova Campanha
          </Button>
        }
      />

      <div className="flex gap-4 mb-6">
        <Select value={canalFilter} onValueChange={setCanalFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Canais</SelectItem>
            <SelectItem value="email">📧 Email</SelectItem>
            <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
          </SelectContent>
        </Select>
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
          <Button variant="link" onClick={() => navigate("nova")}>
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
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{c.nome}</h3>
                        <Badge variant="outline" className={c.canal === "whatsapp" ? "border-green-500/50 text-green-500" : "border-blue-500/50 text-blue-500"}>
                          {c.canal === "whatsapp" ? "WhatsApp" : "Email"}
                        </Badge>
                      </div>
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
                  {(c.canal === "whatsapp"
                    ? [
                        ["Destinatários", totalRecipients],
                        ["Enviados", counts?.enviado || c.enviados || 0],
                        ["Entregues", c.aberturas],
                        ["Lidos", c.cliques],
                        ["Respostas", c.respostas],
                      ]
                    : [
                        ["Destinatários", totalRecipients],
                        ["Enviados", counts?.enviado || c.enviados || 0],
                        ["Aberturas", c.aberturas],
                        ["Cliques", c.cliques],
                        ["Respostas", c.respostas],
                      ]
                  ).map(([label, value]) => (
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
                  campaignCanal={c.canal}
                  loading={loading}
                  totalRecipients={totalRecipients}
                  pendingRecipients={pendingRecipients}
                  hasTemplate={hasTemplate}
                  aprovacaoStatus={c.aprovacao_status}
                  canApproveDispatch={isSuperAdmin}
                  onReview={handleReview}
                  onSend={handleSend}
                  onPause={handlePause}
                  onCancel={handleCancel}
                  onDelete={(id) => setDeleteDialog({ open: true, id })}
                  onAnalytics={() => setAnalyticsCampaign({ id: c.id, nome: c.nome })}
                  onApproveDispatch={(id) => setApproveDialog({ open: true, id })}
                />
              </div>
            );
          })}
        </div>
      )}

      

      <CampaignReviewDialog
        open={!!reviewCampaignId}
        onOpenChange={(open) => !open && setReviewCampaignId(null)}
        campaign={reviewCampaign}
        recipientCounts={reviewCampaignId ? recipientCounts?.[reviewCampaignId] : undefined}
        onApproveForSend={handleApproveForSend}
        loading={actionLoading === reviewCampaignId}
      />

      <CampaignAnalyticsDialog
        open={!!analyticsCampaign}
        onOpenChange={(open) => !open && setAnalyticsCampaign(null)}
        campaignId={analyticsCampaign?.id || null}
        campaignName={analyticsCampaign?.nome}
        onCreateFollowUp={(sourceId, audience, name) => {
          navigate("nova", {
            state: {
              followUpFrom: sourceId,
              followUpAudience: audience,
              sugestaoNome: `Follow-up: ${name}`,
            } satisfies { followUpFrom: string; followUpAudience: FollowUpAudience; sugestaoNome: string },
          });
        }}
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

      <AlertDialog
        open={approveDialog.open}
        onOpenChange={(open) => setApproveDialog({ open, id: open ? approveDialog.id : null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar disparo da campanha</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Esta ação apenas <strong>aprova</strong> o disparo e registra o histórico.
                  Nenhuma mensagem é enviada agora — o scheduler cuidará do envio quando
                  o horário chegar e o envio real Z-API estiver liberado.
                </p>
                {approveAgendaVencida && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400">
                    ⚠️ Se a campanha estiver agendada para horário vencido, o scheduler
                    poderá iniciar no próximo tick quando o envio real estiver liberado.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApproveDispatch}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Aprovar disparo
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
  campaignCanal: string;
  loading: boolean;
  totalRecipients: number;
  pendingRecipients: number;
  hasTemplate: boolean;
  aprovacaoStatus?: string | null;
  canApproveDispatch?: boolean;
  onReview: (id: string) => void;
  onSend: (id: string) => void;
  onPause: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onAnalytics: () => void;
  onApproveDispatch?: (id: string) => void;
}

function CampaignActions({
  status, campaignId, campaignCanal, loading, totalRecipients, pendingRecipients,
  hasTemplate, aprovacaoStatus, canApproveDispatch, onReview, onSend, onPause, onCancel, onDelete, onAnalytics, onApproveDispatch,
}: CampaignActionsProps) {
  const canReview = ["rascunho", "em_revisao"].includes(status) && hasTemplate && totalRecipients > 0;
  const canSend = status === "aprovada_para_envio" && pendingRecipients > 0;
  const canResume = (status === "enviando" || status === "pausada" || status === "pausada_por_limite") && pendingRecipients > 0;
  const canPause = status === "enviando";
  const canCancel = !["concluida", "falha", "cancelada"].includes(status);
  const canDelete = status === "rascunho";
  const canAnalytics = ["enviando", "concluida", "falha", "pausada", "pausada_por_limite"].includes(status);
  const canApprove =
    !!canApproveDispatch &&
    !!onApproveDispatch &&
    ["rascunho", "em_revisao", "agendada", "pausada"].includes(status) &&
    aprovacaoStatus !== "aprovada" &&
    hasTemplate &&
    totalRecipients > 0;

  return (
    <div className="border-t pt-4">
      <div className="flex flex-wrap gap-2">
        {canReview && (
          <Button size="sm" onClick={() => onReview(campaignId)} disabled={loading}>
            <Eye className="h-4 w-4 mr-2" />
            Revisar Campanha
          </Button>
        )}

        {canApprove && (
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10"
            onClick={() => onApproveDispatch!(campaignId)}
            disabled={loading}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Aprovar disparo
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

        {canAnalytics && (
          <Button size="sm" variant="outline" onClick={onAnalytics}>
            <BarChart3 className="h-4 w-4 mr-2" />Analytics
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
