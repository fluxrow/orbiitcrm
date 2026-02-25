import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import SuperAdminLayout from "./SuperAdminLayout";
import {
  useEmpresa,
  useEmpresaUsers,
  useToggleUserAtivo,
  useChangeUserRole,
} from "@/hooks/useSuperAdmin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, MoreHorizontal, Power, Shield, KeyRound } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import AddUserDialog from "@/components/super-admin/AddUserDialog";
import SetPasswordDialog from "@/components/pe-admin/SetPasswordDialog";

export default function EmpresaUsersPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: empresa } = useEmpresa(id || "");
  const { data: users, isLoading } = useEmpresaUsers(id || "");
  const toggleAtivo = useToggleUserAtivo();
  const changeRole = useChangeUserRole();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<{ id: string; nome: string } | null>(null);

  const handleToggleAtivo = async (userId: string, ativo: boolean) => {
    try {
      await toggleAtivo.mutateAsync({ userId, ativo: !ativo });
      toast.success(ativo ? "Usuário desativado" : "Usuário ativado");
    } catch {
      toast.error("Erro ao atualizar status");
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await changeRole.mutateAsync({ userId, role: newRole });
      toast.success("Papel alterado com sucesso");
    } catch {
      toast.error("Erro ao alterar papel");
    }
  };

  const getRoleBadge = (roles: any[]) => {
    const role = roles?.[0]?.role || "—";
    const colors: Record<string, string> = {
      super_admin: "bg-destructive/20 text-destructive",
      admin: "bg-blue-500/20 text-blue-400",
      vendedor: "bg-green-500/20 text-green-400",
      visualizador: "bg-yellow-500/20 text-yellow-400",
    };
    return (
      <span
        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${colors[role] || "bg-muted text-muted-foreground"}`}
      >
        {role}
      </span>
    );
  };

  return (
    <SuperAdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              Usuários — {empresa?.nome || "..."}
            </h1>
            <p className="text-muted-foreground">
              Gerencie os usuários desta empresa
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Usuários Vinculados</CardTitle>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Usuário
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando...
              </div>
            ) : !users?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum usuário vinculado a esta empresa
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user: any) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.nome || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.cargo || "—"}
                      </TableCell>
                      <TableCell>{getRoleBadge(user.user_roles)}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            user.ativo
                              ? "bg-green-500/20 text-green-500"
                              : "bg-red-500/20 text-red-500"
                          }`}
                        >
                          {user.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.created_at &&
                          format(new Date(user.created_at), "dd/MM/yyyy", {
                            locale: ptBR,
                          })}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                handleChangeRole(
                                  user.id,
                                  user.user_roles?.[0]?.role === "admin"
                                    ? "vendedor"
                                    : "admin"
                                )
                              }
                            >
                              <Shield className="w-4 h-4 mr-2" />
                              Alterar para{" "}
                              {user.user_roles?.[0]?.role === "admin"
                                ? "Vendedor"
                                : "Admin"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleToggleAtivo(user.id, user.ativo ?? true)
                              }
                            >
                              <Power className="w-4 h-4 mr-2" />
                              {user.ativo ? "Desativar" : "Ativar"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setPasswordUser({ id: user.id, nome: user.nome || user.email })}
                            >
                              <KeyRound className="w-4 h-4 mr-2" />
                              Definir Senha
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {id && (
          <AddUserDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            empresaId={id}
          />
        )}

        {passwordUser && (
          <SetPasswordDialog
            open={!!passwordUser}
            onOpenChange={(open) => !open && setPasswordUser(null)}
            userId={passwordUser.id}
            userName={passwordUser.nome}
          />
        )}
      </div>
    </SuperAdminLayout>
  );
}
