import { useState } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { CampaignWizard } from "@/components/orbit/CampaignWizard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, MessageSquare, Mail, Loader2, MoreVertical, Play, Pause, X, CheckCircle, Send, Eye, Edit } from "lucide-react";
import { useOrbitCampaigns, useUpdateCampaign, useDeleteCampaign } from "@/hooks/useOrbitCampaigns";
import { supabase } from "@/integrations/supabase/client";
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

  const handleRequestApproval = async (campaignId: string) => {
    try {
      setActionLoading(campaignId);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const response = await supabase.functions.invoke("request-campaign-approval", {
        body: { campaign_id: campaignId, user_id: user.id }
      });

      if (response.error) throw new Error(response.error.message);
      
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

      // Registrar aprovação
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

      if (response.error) throw new Error(response.error.message);

      toast.success(`Enviados: ${response.data.enviados}, Falhas: ${response.data.falhas}`);
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

  const getAvailableActions = (campaign: any) => {
    const status = campaign.status || "rascunho";
    const actions: { label: string; icon: any; action: () => void; variant?: string }[] = [];

    if (status === "rascunho") {
      actions.push({ 
        label: "Solicitar Aprovação", 
        icon: Send, 
        action: () => handleRequestApproval(campaign.id) 
      });
    }

    if (status === "pendente_aprovacao") {
      actions.push({ 
        label: "Aprovar", 
        icon: CheckCircle, 
        action: () => handleApprove(campaign.id),
        variant: "success"
      });
      actions.push({ 
        label: "Reprovar", 
        icon: X, 
        action: () => handleReject(campaign.id),
        variant: "destructive"
      });
    }

    if (status === "aprovada" || campaign.aprovacao_status === "aprovada") {
      actions.push({ 
        label: "Iniciar Envio", 
        icon: Play, 
        action: () => handleSend(campaign.id),
        variant: "success"
      });
    }

    if (status === "enviando") {
      actions.push({ 
        label: "Pausar", 
        icon: Pause, 
        action: () => handlePause(campaign.id) 
      });
    }

    if (status === "pausada") {
      actions.push({ 
        label: "Retomar", 
        icon: Play, 
        action: () => handleSend(campaign.id) 
      });
    }

    if (!["concluida", "cancelada"].includes(status)) {
      actions.push({ 
        label: "Cancelar", 
        icon: X, 
        action: () => handleCancel(campaign.id),
        variant: "destructive"
      });
    }

    if (status === "rascunho") {
      actions.push({ 
        label: "Excluir", 
        icon: X, 
        action: () => setDeleteDialog({ open: true, id: campaign.id }),
        variant: "destructive"
      });
    }

    return actions;
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
            const actions = getAvailableActions(c);
            const isLoading = actionLoading === c.id;
            
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
                  
                  <div className="flex items-center gap-2">
                    <Badge className={statusConfig[c.status || "rascunho"]?.className}>
                      {statusConfig[c.status || "rascunho"]?.label}
                    </Badge>
                    
                    {actions.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={isLoading}>
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreVertical className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {actions.map((action, idx) => (
                            <DropdownMenuItem 
                              key={idx} 
                              onClick={action.action}
                              className={action.variant === "destructive" ? "text-destructive" : action.variant === "success" ? "text-green-600" : ""}
                            >
                              <action.icon className="h-4 w-4 mr-2" />
                              {action.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-4">
                  {[
                    ["Destinatários", c.total_destinatarios],
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
                  <p className="text-sm text-muted-foreground mt-3">
                    📅 Agendada para: {format(new Date(c.agendada_para), "dd/MM/yyyy 'às' HH:mm")}
                  </p>
                )}
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
