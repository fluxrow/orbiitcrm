import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { campaignPermissionKeys, type CampaignPermissionKey, useSetTenantCampaignPermission, useTenantCampaignPermissionGrants } from "@/hooks/useTenantCampaignPermissions";

const labels: Record<CampaignPermissionKey, [string, string]> = {
  campaign_create: ["Criar campanhas", "Criar rascunhos e selecionar público."],
  campaign_edit: ["Editar campanhas", "Editar, recarregar destinatários, pausar e cancelar."],
  campaign_submit_review: ["Enviar para revisão", "Mover um rascunho para revisão."],
  campaign_approve: ["Aprovar campanhas", "Aprovar conteúdo e autorização de disparo."],
  campaign_dispatch: ["Executar disparo", "Solicitar envio quando todas as demais travas estiverem liberadas."],
};

export function CampaignPermissionsDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (open: boolean) => void; user: any }) {
  const { data: grants = [], isLoading } = useTenantCampaignPermissionGrants();
  const setPermission = useSetTenantCampaignPermission();
  const active = new Set(grants.filter((grant) => grant.user_id === user?.id && !grant.revoked_at).map((grant) => grant.permission_key));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg">
    <DialogHeader><DialogTitle>Permissões de campanhas</DialogTitle></DialogHeader>
    <div><p className="font-medium">{user?.full_name || user?.email}</p><p className="text-sm text-muted-foreground">Válidas somente para o tenant atual.</p></div>
    <div className="space-y-3">{campaignPermissionKeys.map((key) => <div key={key} className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <div className="space-y-1"><Label htmlFor={`permission-${key}`}>{labels[key][0]}</Label><p className="text-xs text-muted-foreground">{labels[key][1]}</p>{key === "campaign_dispatch" && <Badge variant="outline" className="text-amber-500">Não libera envio real sozinho</Badge>}</div>
      <Switch id={`permission-${key}`} checked={active.has(key)} disabled={isLoading || setPermission.isPending || !user} onCheckedChange={(granted) => setPermission.mutate({ userId: user.id, permissionKey: key, granted })} />
    </div>)}</div>
  </DialogContent></Dialog>;
}
