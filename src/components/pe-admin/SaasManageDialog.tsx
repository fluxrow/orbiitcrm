import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useUpdateSaasEmpresa, useSaasPlans, type SaasEmpresa } from "@/hooks/useSaasPlans";

interface SaasManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresa: SaasEmpresa | null;
}

const STATUS_OPTIONS = [
  { value: "invited", label: "Convidado" },
  { value: "onboarding", label: "Onboarding" },
  { value: "active", label: "Ativo" },
  { value: "suspended", label: "Suspenso" },
  { value: "canceled", label: "Cancelado" },
];


export default function SaasManageDialog({ open, onOpenChange, empresa }: SaasManageDialogProps) {
  const updateSaas = useUpdateSaasEmpresa();
  const { data: plans } = useSaasPlans();
  const [status, setStatus] = useState(empresa?.status || "invited");
  const [planId, setPlanId] = useState(empresa?.plan_id || "");
  const [trialEndsAt, setTrialEndsAt] = useState(empresa?.trial_ends_at?.slice(0, 10) || "");

  // Reset state when empresa changes
  const currentEmpresaId = empresa?.empresa_id;
  const [lastId, setLastId] = useState(currentEmpresaId);
  if (currentEmpresaId !== lastId) {
    setLastId(currentEmpresaId);
    setStatus(empresa?.status || "invited");
    setPlanId(empresa?.plan_id || "");
    setTrialEndsAt(empresa?.trial_ends_at?.slice(0, 10) || "");
  }

  if (!empresa) return null;

  const handleSave = async () => {
    try {
      await updateSaas.mutateAsync({
        empresaId: empresa.empresa_id,
        status,
        plan_id: planId,
        trial_ends_at: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
        activated_at: status === "active" && !empresa.activated_at ? new Date().toISOString() : empresa.activated_at,
      });
      toast.success("Assinatura atualizada com sucesso");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar Assinatura</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{empresa.responsible_name || empresa.responsible_email}</span>
            <Badge variant="outline">{empresa.saas_plans?.name || "—"}</Badge>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Plano</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(plans ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>




          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={updateSaas.isPending}>
              {updateSaas.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
