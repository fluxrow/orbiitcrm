import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCreateProspectEvent } from "@/hooks/useProspectEvents";
import { toast } from "sonner";

interface AddNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: any | null;
  empresaId: string;
  userId?: string;
}

export function AddNoteDialog({ open, onOpenChange, prospect, empresaId, userId }: AddNoteDialogProps) {
  const [note, setNote] = useState("");
  const createEvent = useCreateProspectEvent();

  const handleSubmit = async () => {
    if (!note.trim() || !prospect) return;
    try {
      await createEvent.mutateAsync({
        empresa_id: empresaId,
        prospect_id: prospect.id,
        actor_user_id: userId,
        event_type: "note_added",
        titulo: "Nota adicionada",
        descricao: note.trim(),
      });
      toast.success("Nota adicionada!");
      setNote("");
      onOpenChange(false);
    } catch {
      toast.error("Erro ao adicionar nota");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Nota — {prospect?.nome_razao}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Nota</Label>
            <Textarea
              className="mt-1 min-h-[120px]"
              placeholder="Escreva sua nota sobre este prospect..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createEvent.isPending || !note.trim()}>
              {createEvent.isPending ? "Salvando..." : "Salvar Nota"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
