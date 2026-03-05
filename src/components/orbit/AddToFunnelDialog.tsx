import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useFunilEtapas } from "@/hooks/useFunilEtapas";
import { usePromoteProspect } from "@/hooks/usePromoteProspect";
import { useCreateProspectEvent } from "@/hooks/useProspectEvents";
import { toast } from "sonner";

interface AddToFunnelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospects: any[];
  empresaId: string;
}

export function AddToFunnelDialog({ open, onOpenChange, prospects, empresaId }: AddToFunnelDialogProps) {
  const [selectedEtapaId, setSelectedEtapaId] = useState("");
  const { data: etapas, isLoading } = useFunilEtapas();
  const promoteProspect = usePromoteProspect();
  const createEvent = useCreateProspectEvent();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async () => {
    if (!selectedEtapaId) { toast.error("Selecione uma etapa"); return; }
    setProcessing(true);
    let success = 0;
    for (const p of prospects) {
      try {
        await promoteProspect.mutateAsync({
          empresa_id: empresaId,
          prospect_id: p.id,
          create_opportunity: true,
        });
        await createEvent.mutateAsync({
          empresa_id: empresaId,
          prospect_id: p.id,
          event_type: "pipeline_added",
          titulo: "Adicionado ao funil",
          descricao: `Prospect convertido e adicionado ao pipeline`,
        });
        success++;
      } catch (e) {
        console.error("Erro ao promover prospect", p.id, e);
      }
    }
    toast.success(`${success} prospect(s) adicionado(s) ao funil`);
    setProcessing(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar ao Funil ({prospects.length} prospect{prospects.length > 1 ? "s" : ""})</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Etapa do funil</Label>
            <Select value={selectedEtapaId} onValueChange={setSelectedEtapaId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione a etapa" />
              </SelectTrigger>
              <SelectContent>
                {etapas?.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={processing || isLoading}>
              {processing ? "Processando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
