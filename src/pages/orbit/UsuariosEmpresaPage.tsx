import { useState } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import {
  useEmpresaUsers,
  useToggleUserAtivo,
  useChangeUserRole,
} from "@/hooks/useSuperAdmin";
import { useUserEmpresa } from "@/hooks/useUserRole";
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
import { Plus, MoreHorizontal, Power, Shield, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import AddUserDialog from "@/components/super-admin/AddUserDialog";

export default function UsuariosEmpresaPage() {
  const { data: empresa } = useUserEmpresa();
  const empresaId = empresa?.id || "";
  const { data: users, isLoading } = useEmpresaUsers(empresaId);
  const toggleAtivo = useToggleUserAtivo();
  const changeRole = useChangeUserRole();
  const [dialogOpen, setDialogOpen] = useState(false);

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
    <OrbitLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Usuários"
            description="Gerencie os usuários da sua empresa"
          />
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Usuário
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Usuários da Empresa</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !empresaId ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando...
              </div>
            ) : !users?.length ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Nenhum usuário encontrado
                </p>
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

        {empresaId && (
          <AddUserDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            empresaId={empresaId}
          />
        )}
      </div>
    </OrbitLayout>
  );
}
