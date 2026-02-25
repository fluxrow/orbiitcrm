import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface ActivateInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invitation: {
    id: string;
    email: string;
    token: string;
    organization_id: string;
  } | null;
}

export default function ActivateInviteDialog({ open, onOpenChange, invitation }: ActivateInviteDialogProps) {
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("accept-invitation", {
        body: {
          token: invitation.token,
          password,
          full_name: fullName || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error?.message || "Erro ao ativar convite");
      toast.success("Convite ativado com sucesso! Usuário criado.");
      setPassword("");
      setFullName("");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
      queryClient.invalidateQueries({ queryKey: ["org-invitations"] });
    } catch (error: any) {
      toast.error(error.message || "Erro ao ativar convite");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ativar Convite Manualmente</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Criar conta para <strong>{invitation?.email}</strong> sem que o usuário precise clicar no link do convite.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="activate-name">Nome Completo</Label>
            <Input
              id="activate-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome do usuário"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="activate-password">Senha *</Label>
            <Input
              id="activate-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? "Ativando..." : "Ativar Convite"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
