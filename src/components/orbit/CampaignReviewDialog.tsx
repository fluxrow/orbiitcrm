import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, MessageSquare, Mail, Loader2, Users, AlertTriangle, Info, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { usePeAuth } from "@/hooks/usePeAuth";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface RecipientCounts {
  total: number;
  pendente: number;
}

interface CampaignReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: any;
  recipientCounts?: RecipientCounts;
  onApproveForSend: (id: string) => void;
  loading: boolean;
}

export function CampaignReviewDialog({
  open,
  onOpenChange,
  campaign,
  recipientCounts,
  onApproveForSend,
  loading,
}: CampaignReviewDialogProps) {
  const { user } = useAuth();
  const { peUser } = usePeAuth();

  const queryClient = useQueryClient();
  const [reloading, setReloading] = useState(false);

  if (!campaign) return null;

  const template = campaign.template as any;
  const totalRecipients = recipientCounts?.total || campaign.total_destinatarios || 0;
  const pendingRecipients = recipientCounts?.pendente || 0;

  const handleReloadRecipients = async () => {
    try {
      setReloading(true);
      const { data, error } = await supabase.rpc(
        "pe_populate_campaign_recipients" as any,
        { p_campaign_id: campaign.id },
      );
      if (error) throw error;
      const inserted = (data as any)?.inserted ?? 0;
      const total = (data as any)?.total ?? 0;
      await queryClient.invalidateQueries({ queryKey: ["campaign_recipient_counts"] });
      await queryClient.invalidateQueries({ queryKey: ["orbit_campaigns"] });
      if (total === 0) {
        toast.warning("Nenhum destinatário elegível encontrado para os filtros desta campanha.");
      } else {
        toast.success(`${inserted} novo(s) destinatário(s) carregado(s). Total: ${total}.`);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao recarregar destinatários");
    } finally {
      setReloading(false);
    }
  };
  const invalidRecipients = totalRecipients - pendingRecipients;

  const isEmail = campaign.canal === "email";
  const senderName = peUser?.full_name || "";
  const senderEmail = user?.email || "";
  const usePersonalSignature = peUser?.use_personal_signature || false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Revisar Campanha
          </DialogTitle>
        </DialogHeader>

        {/* Campaign Summary */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Nome</p>
              <p className="font-medium">{campaign.nome}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Canal</p>
              <div className="flex items-center gap-2">
                {campaign.canal === "whatsapp" ? (
                  <MessageSquare className="h-4 w-4 text-green-500" />
                ) : (
                  <Mail className="h-4 w-4 text-blue-500" />
                )}
                <span className="capitalize">{campaign.canal}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Template</p>
              <p className="font-medium">{template?.nome || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Criada em</p>
              <p>{campaign.created_at ? format(new Date(campaign.created_at), "dd/MM/yyyy HH:mm") : "—"}</p>
            </div>
          </div>

          <Separator />

          {/* Message Content */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Conteúdo da Mensagem</h4>
            {template?.corpo_texto ? (
              <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap border">
                {template.corpo_texto}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Nenhum texto configurado no template.</p>
            )}
          </div>

          {/* Image Preview */}
          {template?.imagem_url && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Imagem</h4>
              <img
                src={template.imagem_url}
                alt="Imagem da campanha"
                className="rounded-lg border max-h-48 object-contain"
              />
            </div>
          )}

          <Separator />

          {/* Email Signature & Reply-To Info */}
          {isEmail && (
            <>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Configuração de Envio
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 border">
                    <p className="text-xs text-muted-foreground">Responsável</p>
                    <p className="text-sm font-medium">{senderName || "—"}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 border">
                    <p className="text-xs text-muted-foreground">Reply-To</p>
                    <p className="text-sm font-medium">{senderEmail || "—"}</p>
                  </div>
                </div>
                {usePersonalSignature && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                    <Info className="h-4 w-4 text-blue-500 shrink-0" />
                    <span>
                      Assinatura personalizada ativa. As respostas desta campanha serão enviadas para <strong>{senderEmail}</strong>.
                    </span>
                  </div>
                )}
                {!senderEmail && (
                  <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Configure um e-mail válido no perfil para utilizar reply-to personalizado.
                  </div>
                )}
              </div>
              <Separator />
            </>
          )}

          {/* Recipients */}
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" /> Destinatários
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 border">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold">{totalRecipients}</p>
              </div>
              <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                <p className="text-xs text-green-600">Pendentes (válidos)</p>
                <p className="text-xl font-bold text-green-600">{pendingRecipients}</p>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
                <p className="text-xs text-amber-600">Já enviados / Inválidos</p>
                <p className="text-xl font-bold text-amber-600">{invalidRecipients}</p>
              </div>
            </div>
            {pendingRecipients === 0 && totalRecipients > 0 && (
              <div className="flex items-center gap-2 mt-3 text-sm text-amber-500">
                <AlertTriangle className="h-4 w-4" />
                Nenhum destinatário pendente para envio.
              </div>
            )}
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReloadRecipients}
                disabled={reloading}
              >
                {reloading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Recarregar destinatários
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            onClick={() => onApproveForSend(campaign.id)}
            disabled={loading || pendingRecipients === 0}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            Aprovar para Envio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
