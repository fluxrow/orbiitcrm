import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { handleApiResponse } from "@/lib/api-envelope";

interface SetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

export default function SetPasswordDialog({ open, onOpenChange, userId, userName }: SetPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      const response = await supabase.functions.invoke("admin-set-password", {
        body: { user_id: userId, password },
      });
      handleApiResponse(response);
      toast.success("Senha atualizada com sucesso");
      setPassword("");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar senha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Definir Senha</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Definir nova senha para <strong>{userName}</strong></p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nova Senha *</Label>
            <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Definir Senha"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
