import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useOrgUsers, useInviteUser, useAddOrgUser } from "@/hooks/useOrgUsers";
import { useOrgInvitations, useCancelInvitation, useResendInvitation } from "@/hooks/usePeInvitations";
import { usePeRoles } from "@/hooks/usePeRoles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditUserDialog } from "@/components/orbit/EditUserDialog";
import { UserPlus, Plus, Mail, Clock, RefreshCw, Pencil } from "lucide-react";
import { format } from "date-fns";

export default function ConfigUsersTab() {
  // Multi-tenant fix: derive orgId from the ACTIVE tenant (URL-based), not from
  // the user's home pe_users.organization_id. Otherwise an admin navigating to
  // /fluxrow/config sees users of their original org (e.g. Promotrip).
  const { empresaId } = useTenant();

  const { data: orgId, isLoading: orgIdLoading } = useQuery({
    queryKey: ["tenant-org-id", empresaId],
    queryFn: async () => {
      if (!empresaId) return null;
      const { data, error } = await supabase
        .from("pe_tenant_map" as any)
        .select("organization_id")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (error) throw error;
      return (data as any)?.organization_id ?? null;
    },
    enabled: !!empresaId,
  });

  const { data: users, isLoading } = useOrgUsers(orgId);
  const { data: invitations } = useOrgInvitations(orgId);
  const { data: roles } = usePeRoles();
  const inviteUser = useInviteUser();
  const addUser = useAddOrgUser();
  const cancelInvite = useCancelInvitation();
  const resendInvite = useResendInvitation();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [inviteForm, setInviteForm] = useState({ email: "", role_code: "", full_name: "" });
  const [addForm, setAddForm] = useState({ email: "", password: "", role_code: "", full_name: "" });

  const pendingInvitations = invitations?.filter((i: any) => i.status === "pending") || [];

  const handleInvite = async () => {
    if (!orgId) return;
    await inviteUser.mutateAsync({ organization_id: orgId, ...inviteForm });
    setInviteOpen(false);
    setInviteForm({ email: "", role_code: "", full_name: "" });
  };

  const handleAdd = async () => {
    if (!orgId) return;
    await addUser.mutateAsync({ organization_id: orgId, ...addForm });
    setAddOpen(false);
    setAddForm({ email: "", password: "", role_code: "", full_name: "" });
  };

  const handleEditUser = (user: any) => {
    setEditingUser(user);
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Usuários da Organização</h3>
          <p className="text-sm text-muted-foreground">Gerencie os membros da sua equipe</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" /> Adicionar
          </Button>
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Convidar
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : !users?.length ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum usuário</TableCell></TableRow>
            ) : (
              users.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-foreground">{u.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground">{u.whatsapp || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{u.cargo || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{u.pe_roles?.name || "—"}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={u.is_active ? "default" : "secondary"}>
                      {u.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleEditUser(u)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pendingInvitations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" /> Convites Pendentes
          </h3>
          <div className="border border-border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" />{inv.email}</TableCell>
                    <TableCell><Badge variant="outline">{inv.pe_roles?.name || "—"}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(inv.expires_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resendInvite.mutate({
                          id: inv.id,
                          orgId: orgId!,
                          email: inv.email,
                          role_code: inv.pe_roles?.code || "",
                          full_name: inv.full_name,
                        })}
                        disabled={resendInvite.isPending}
                      >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        {resendInvite.isPending ? "Reenviando..." : "Reenviar"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => cancelInvite.mutate({ id: inv.id, orgId: orgId! })}>Cancelar</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Edit User Dialog */}
      <EditUserDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        user={editingUser}
        roles={roles || []}
        orgId={orgId || ""}
      />

      {/* Dialog: Convidar */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Convidar Usuário</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome</Label><Input value={inviteForm.full_name} onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })} /></div>
            <div><Label>Email *</Label><Input value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} type="email" /></div>
            <div>
              <Label>Papel *</Label>
              <Select value={inviteForm.role_code} onValueChange={(v) => setInviteForm({ ...inviteForm, role_code: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {roles?.map((r: any) => (<SelectItem key={r.id} value={r.code}>{r.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={!inviteForm.email || !inviteForm.role_code || inviteUser.isPending}>
              {inviteUser.isPending ? "Enviando..." : "Enviar Convite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Adicionar */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Usuário</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input value={addForm.full_name} onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })} placeholder="Nome completo" /></div>
            <div><Label>Email *</Label><Input value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} type="email" placeholder="email@exemplo.com" /></div>
            <div><Label>Senha *</Label><Input value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} type="password" placeholder="Mínimo 6 caracteres" /></div>
            <div>
              <Label>Papel *</Label>
              <Select value={addForm.role_code} onValueChange={(v) => setAddForm({ ...addForm, role_code: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {roles?.map((r: any) => (<SelectItem key={r.id} value={r.code}>{r.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={!addForm.email || !addForm.full_name || addForm.password.length < 6 || !addForm.role_code || addUser.isPending}>
              {addUser.isPending ? "Adicionando..." : "Adicionar Usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
