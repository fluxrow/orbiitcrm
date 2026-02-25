import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganizations";
import { useOrgUsers, useUpdateOrgUser, useInviteUser } from "@/hooks/useOrgUsers";
import { useOrgInvitations, useCancelInvitation } from "@/hooks/usePeInvitations";
import { usePeRoles } from "@/hooks/usePeRoles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, MoreHorizontal, Plus, Mail, Clock, KeyRound, UserCheck } from "lucide-react";
import { format } from "date-fns";
import SetPasswordDialog from "@/components/pe-admin/SetPasswordDialog";
import ActivateInviteDialog from "@/components/pe-admin/ActivateInviteDialog";

export default function PeOrgUsersPage() {
  const { id: orgId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: org } = useOrganization(orgId);
  const { data: users, isLoading } = useOrgUsers(orgId);
  const { data: invitations } = useOrgInvitations(orgId);
  const { data: roles } = usePeRoles();
  const updateUser = useUpdateOrgUser();
  const inviteUser = useInviteUser();
  const cancelInvite = useCancelInvitation();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", role_code: "", full_name: "" });
  const [pwdUser, setPwdUser] = useState<{ id: string; name: string } | null>(null);
  const [activateInvite, setActivateInvite] = useState<any>(null);

  const pendingInvitations = invitations?.filter((i: any) => i.status === "pending") || [];

  const handleInvite = async () => {
    if (!orgId) return;
    await inviteUser.mutateAsync({ organization_id: orgId, ...inviteForm });
    setInviteOpen(false);
    setInviteForm({ email: "", role_code: "", full_name: "" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pe-admin/organizations")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuários — {org?.name || "..."}</h1>
          <p className="text-sm text-muted-foreground">Gerencie os membros desta organização</p>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Convidar Usuário
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <div className="border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Desde</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : !users?.length ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum usuário nesta organização</TableCell></TableRow>
            ) : (
              users.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-foreground">{u.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{u.pe_roles?.name || "—"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.is_active ? "default" : "secondary"}>
                      {u.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(u.created_at), "dd/MM/yyyy")}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setPwdUser({ id: u.id, name: u.full_name || u.email })}>
                          <KeyRound className="w-4 h-4 mr-2" /> Definir Senha
                        </DropdownMenuItem>
                        {roles?.map((r: any) => (
                          <DropdownMenuItem
                            key={r.id}
                            onClick={() => updateUser.mutate({ userId: u.id, orgId: orgId!, role_id: r.id })}
                            disabled={u.role_id === r.id}
                          >
                            Papel: {r.name}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem onClick={() => updateUser.mutate({ userId: u.id, orgId: orgId!, is_active: !u.is_active })}>
                          {u.is_active ? "Inativar" : "Ativar"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" /> Convites Pendentes
          </h2>
          <div className="border border-border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{inv.email}</span>
                    </TableCell>
                    <TableCell><Badge variant="outline">{inv.pe_roles?.name || "—"}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(inv.expires_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActivateInvite(inv)}
                        title="Ativar manualmente"
                      >
                        <UserCheck className="w-4 h-4 mr-1" /> Ativar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => cancelInvite.mutate({ id: inv.id, orgId: orgId! })}>
                        Cancelar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={inviteForm.full_name} onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })} placeholder="Nome completo" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="email@exemplo.com" type="email" />
            </div>
            <div>
              <Label>Papel *</Label>
              <Select value={inviteForm.role_code} onValueChange={(v) => setInviteForm({ ...inviteForm, role_code: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o papel" /></SelectTrigger>
                <SelectContent>
                  {roles?.map((r: any) => (
                    <SelectItem key={r.id} value={r.code}>{r.name}</SelectItem>
                  ))}
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

      {/* Set Password Dialog */}
      {pwdUser && (
        <SetPasswordDialog
          open={!!pwdUser}
          onOpenChange={(open) => !open && setPwdUser(null)}
          userId={pwdUser.id}
          userName={pwdUser.name}
        />
      )}

      {/* Activate Invite Dialog */}
      <ActivateInviteDialog
        open={!!activateInvite}
        onOpenChange={(open) => !open && setActivateInvite(null)}
        invitation={activateInvite}
      />
    </div>
  );
}
