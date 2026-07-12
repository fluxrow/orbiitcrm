import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUpdateOrgUser } from "@/hooks/useOrgUsers";
import { usePeAuth } from "@/hooks/usePeAuth";

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
  roles: any[];
  orgId: string;
}

export function EditUserDialog({ open, onOpenChange, user, roles, orgId }: EditUserDialogProps) {
  const updateUser = useUpdateOrgUser();
  const { isSuperAdmin } = usePeAuth();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    whatsapp: "",
    cargo: "",
    role_id: "",
    is_active: true,
  });

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name || "",
        phone: user.phone || "",
        whatsapp: user.whatsapp || "",
        cargo: user.cargo || "",
        role_id: user.role_id || "",
        is_active: user.is_active ?? true,
      });
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    // Only super admins can change role_id. Strip it for everyone else so the
    // RPC isn't invoked (it would raise 42501) and the direct UPDATE succeeds.
    const payload: any = { userId: user.id, orgId, ...form };
    if (!isSuperAdmin) delete payload.role_id;
    await updateUser.mutateAsync(payload);
    onOpenChange(false);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={user.email} disabled className="bg-muted" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 3456-7890" />
            </div>
            <div>
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="5511999999999" />
            </div>
          </div>
          <div>
            <Label>Cargo</Label>
            <Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Ex: Gerente Comercial" />
          </div>
          <div>
            <Label>Papel *</Label>
            <Select value={form.role_id} onValueChange={(v) => setForm({ ...form, role_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {roles?.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label>Ativo</Label>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!form.full_name || !form.role_id || updateUser.isPending}>
            {updateUser.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
