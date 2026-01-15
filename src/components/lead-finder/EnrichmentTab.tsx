import { useState, useEffect } from "react";
import {
  useEnrichmentPolicy,
  useEnrichmentCredits,
  useUpsertEnrichmentPolicy,
} from "@/hooks/useLeadFinder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Coins, Zap, Save } from "lucide-react";

export function EnrichmentTab() {
  const { data: policy } = useEnrichmentPolicy();
  const { data: credits } = useEnrichmentCredits();
  const upsertPolicy = useUpsertEnrichmentPolicy();

  const [formData, setFormData] = useState({
    ativa: true,
    limite_diario: 1000,
    limite_por_job: 100,
    tentativas_por_lead: 3,
    cooldown_horas: 24,
    status_permitidos: ["aprovado", "novo"],
    custo_email: 1,
    custo_telefone: 1,
  });

  useEffect(() => {
    if (policy) {
      setFormData({
        ativa: policy.ativa,
        limite_diario: policy.limite_diario,
        limite_por_job: policy.limite_por_job,
        tentativas_por_lead: policy.tentativas_por_lead,
        cooldown_horas: policy.cooldown_horas,
        status_permitidos: policy.status_permitidos,
        custo_email: policy.custo_email,
        custo_telefone: policy.custo_telefone,
      });
    }
  }, [policy]);

  const handleSave = () => {
    upsertPolicy.mutate(formData);
  };

  const toggleStatus = (status: string) => {
    setFormData((prev) => ({
      ...prev,
      status_permitidos: prev.status_permitidos.includes(status)
        ? prev.status_permitidos.filter((s) => s !== status)
        : [...prev.status_permitidos, status],
    }));
  };

  const creditsUsed = credits?.creditos_usados ?? 0;
  const creditsLimit = credits?.creditos_limite ?? formData.limite_diario;
  const creditsRemaining = creditsLimit - creditsUsed;

  return (
    <div className="space-y-6">
      {/* Credits Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Coins className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Créditos Hoje</p>
            <p className="text-xl font-semibold">
              {creditsUsed}/{creditsLimit}
            </p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-success" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Restantes</p>
            <p className="text-xl font-semibold">{creditsRemaining}</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              formData.ativa ? "bg-success/10" : "bg-muted"
            }`}
          >
            <div
              className={`w-3 h-3 rounded-full ${
                formData.ativa ? "bg-success" : "bg-muted-foreground"
              }`}
            />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="text-xl font-semibold">
              {formData.ativa ? "Ativo" : "Inativo"}
            </p>
          </div>
        </div>
      </div>

      {/* Policy Form */}
      <div className="glass-card p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">Política de Enrichment</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure limites de créditos, tentativas e regras
          </p>
        </div>

        <div className="space-y-6">
          {/* Política Ativa */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Política Ativa</Label>
              <p className="text-sm text-muted-foreground">
                Habilitar processamento automático de enrichment
              </p>
            </div>
            <Switch
              checked={formData.ativa}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, ativa: checked }))
              }
            />
          </div>

          {/* Limites */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="limite_diario">Limite Diário</Label>
              <Input
                id="limite_diario"
                type="number"
                value={formData.limite_diario}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    limite_diario: parseInt(e.target.value) || 0,
                  }))
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="limite_por_job">Limite por Job</Label>
              <Input
                id="limite_por_job"
                type="number"
                value={formData.limite_por_job}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    limite_por_job: parseInt(e.target.value) || 0,
                  }))
                }
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Tentativas e Cooldown */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tentativas">Tentativas por Lead</Label>
              <Input
                id="tentativas"
                type="number"
                value={formData.tentativas_por_lead}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    tentativas_por_lead: parseInt(e.target.value) || 0,
                  }))
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="cooldown">Cooldown após Falha (horas)</Label>
              <Input
                id="cooldown"
                type="number"
                value={formData.cooldown_horas}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    cooldown_horas: parseInt(e.target.value) || 0,
                  }))
                }
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Status Permitidos */}
          <div>
            <Label>Status Permitidos</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {["novo", "aprovado", "rejeitado", "importado"].map((status) => (
                <Badge
                  key={status}
                  variant={formData.status_permitidos.includes(status) ? "default" : "secondary"}
                  className="cursor-pointer capitalize"
                  onClick={() => toggleStatus(status)}
                >
                  {status}
                </Badge>
              ))}
            </div>
          </div>

          {/* Custos */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="custo_email">Custo por Email</Label>
              <Input
                id="custo_email"
                type="number"
                value={formData.custo_email}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    custo_email: parseInt(e.target.value) || 0,
                  }))
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="custo_telefone">Custo por Telefone</Label>
              <Input
                id="custo_telefone"
                type="number"
                value={formData.custo_telefone}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    custo_telefone: parseInt(e.target.value) || 0,
                  }))
                }
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={upsertPolicy.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {upsertPolicy.isPending ? "Salvando..." : "Salvar Política"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
