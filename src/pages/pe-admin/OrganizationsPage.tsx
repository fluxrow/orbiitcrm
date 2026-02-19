import { useState } from "react";
import { useOrganizations, useCreateOrganization, useToggleOrgStatus } from "@/hooks/useOrganizations";
import { useOrgUsers } from "@/hooks/useOrgUsers";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, MoreHorizontal, Search, Users, Building2 } from "lucide-react";
import { format } from "date-fns";

export default function OrganizationsPage() {
  const navigate = useNavigate();
  const { data: orgs, isLoading } = useOrganizations();
  const createOrg = useCreateOrganization();
  const toggleStatus = useToggleOrgStatus();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<any>(null);
  const [form, setForm] = useState({ name: "", legal_name: "", cnpj: "" });

  const filtered = orgs?.filter((o: any) => {
    const matchSearch = o.name?.toLowerCase().includes(search.toLowerCase()) || o.cnpj?.includes(search);
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  }) || [];

  const handleCreate = async () => {
    await createOrg.mutateAsync({ name: form.name, legal_name: form.legal_name || undefined, cnpj: form.cnpj || undefined });
    setDialogOpen(false);
    setForm({ name: "", legal_name: "", cnpj: "" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Organizações</h1>
          <p className="text-sm text-muted-foreground">Gerencie as organizações do sistema</p>
        </div>
        <Button onClick={() => { setEditOrg(null); setForm({ name: "", legal_name: "", cnpj: "" }); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Nova Organização
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou CNPJ..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select
          className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
      </div>

      <div className="border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma organização encontrada</TableCell></TableRow>
            ) : (
              filtered.map((org: any) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium text-foreground">{org.name}</div>
                        {org.legal_name && <div className="text-xs text-muted-foreground">{org.legal_name}</div>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{org.cnpj || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={org.status === "active" ? "default" : "secondary"}>
                      {org.status === "active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(org.created_at), "dd/MM/yyyy")}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/pe-admin/organizations/${org.id}/users`)}>
                          <Users className="w-4 h-4 mr-2" /> Ver Usuários
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleStatus.mutate({ id: org.id, status: org.status })}>
                          {org.status === "active" ? "Inativar" : "Ativar"}
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

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Organização</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome da organização" />
            </div>
            <div>
              <Label>Razão Social</Label>
              <Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} placeholder="Razão social" />
            </div>
            <div>
              <Label>CNPJ</Label>
              <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!form.name || createOrg.isPending}>
              {createOrg.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
