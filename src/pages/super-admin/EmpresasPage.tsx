import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SuperAdminLayout from "./SuperAdminLayout";
import { useEmpresas, useToggleEmpresaAtivo } from "@/hooks/useSuperAdmin";
import { useTenantMaps } from "@/hooks/useTenantMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Search, MoreHorizontal, Building2, Power, Edit, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import EmpresaDialog from "@/components/super-admin/EmpresaDialog";

export default function EmpresasPage() {
  const { data: empresas, isLoading } = useEmpresas();
  const { data: tenantMaps } = useTenantMaps();
  const toggleAtivo = useToggleEmpresaAtivo();

  const mappedEmpresaIds = new Set(tenantMaps?.map((tm: any) => tm.empresa_id) || []);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filteredEmpresas = empresas?.filter(
    (e) =>
      e.nome.toLowerCase().includes(search.toLowerCase()) ||
      e.cnpj?.includes(search) ||
      e.email_contato?.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleAtivo = async (id: string, ativo: boolean) => {
    try {
      await toggleAtivo.mutateAsync({ id, ativo: !ativo });
      toast.success(ativo ? 'Empresa desativada' : 'Empresa ativada');
    } catch (error) {
      toast.error('Erro ao atualizar empresa');
    }
  };

  const planoBadgeColor = (plano: string | null) => {
    switch (plano) {
      case 'enterprise':
        return 'bg-purple-500/20 text-purple-400';
      case 'pro':
        return 'bg-blue-500/20 text-blue-400';
      case 'basico':
        return 'bg-green-500/20 text-green-400';
      default:
        return 'bg-yellow-500/20 text-yellow-400';
    }
  };

  return (
    <SuperAdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Empresas</h1>
            <p className="text-muted-foreground">
              Gerencie as empresas cadastradas no sistema
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Empresa
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Lista de Empresas</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar empresa..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando...
              </div>
            ) : !filteredEmpresas?.length ? (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma empresa encontrada</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Usuários</TableHead>
                    <TableHead>PE</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmpresas.map((empresa) => (
                    <TableRow key={empresa.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{empresa.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {empresa.email_contato || '-'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {empresa.cnpj || '-'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-xs font-medium capitalize ${planoBadgeColor(empresa.plano)}`}
                        >
                          {empresa.plano || 'trial'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">
                          0/{empresa.max_usuarios || 5}
                        </span>
                      </TableCell>
                      <TableCell>
                        {mappedEmpresaIds.has(empresa.id) ? (
                          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary">
                            Provisionado
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            Pendente
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            empresa.ativo
                              ? 'bg-green-500/20 text-green-500'
                              : 'bg-red-500/20 text-red-500'
                          }`}
                        >
                          {empresa.ativo ? 'Ativa' : 'Inativa'}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {empresa.created_at &&
                          format(new Date(empresa.created_at), "dd/MM/yyyy", {
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
                            <DropdownMenuItem>
                              <Edit className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => navigate(`/super-admin/empresas/${empresa.id}/usuarios`)}
                            >
                              <Users className="w-4 h-4 mr-2" />
                              Ver Usuários
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleToggleAtivo(empresa.id, empresa.ativo || false)
                              }
                            >
                              <Power className="w-4 h-4 mr-2" />
                              {empresa.ativo ? 'Desativar' : 'Ativar'}
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

        <EmpresaDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </div>
    </SuperAdminLayout>
  );
}
