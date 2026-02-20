import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useUpdateOportunidade } from "@/hooks/useOportunidades";
import { useFunilEtapas } from "@/hooks/useFunilEtapas";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  oportunidadeId: string;
}

export function MotivoPerda({ open, onOpenChange, oportunidadeId }: Props) {
  const [motivo, setMotivo] = useState("");
  const update = useUpdateOportunidade();
  const { data: etapas } = useFunilEtapas();

  const handleSubmit = async () => {
    const lostEtapa = (etapas || []).find((e: any) => e.tipo === "lost");
    await update.mutateAsync({
      id: oportunidadeId,
      motivo_perda: motivo || null,
      ...(lostEtapa ? { etapa_id: lostEtapa.id } : {}),
    });
    setMotivo("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Motivo da Perda</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Por que esta oportunidade foi perdida?</Label>
            <Textarea className="mt-2" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Opcional..." />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleSubmit} disabled={update.isPending}>
              {update.isPending ? "Salvando..." : "Confirmar Perda"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
