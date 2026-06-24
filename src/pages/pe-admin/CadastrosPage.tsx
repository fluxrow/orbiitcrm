import { useState } from "react";
import { PageHeader } from "@/components/orbit/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSaasEmpresas, type SaasEmpresa } from "@/hooks/useSaasPlans";
import { format } from "date-fns";
import { Search, Settings2 } from "lucide-react";
import SaasManageDialog from "@/components/pe-admin/SaasManageDialog";

function statusBadgeSaas(status: string) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-600 text-white hover:bg-green-700">Ativo</Badge>;
    case "suspended":
    case "canceled":
      return <Badge variant="destructive">{status === "suspended" ? "Suspenso" : "Cancelado"}</Badge>;
    default:
      return <Badge className="bg-blue-500 text-white hover:bg-blue-600">{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
  }
}

function fmt(dateStr: string | null) {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd/MM/yyyy HH:mm");
}

export default function CadastrosPage() {
  const [searchSaas, setSearchSaas] = useState("");
  const { data: saasEmpresas, isLoading: loadingSaas } = useSaasEmpresas();
  const [manageEmpresa, setManageEmpresa] = useState<SaasEmpresa | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const filteredSaas = (saasEmpresas ?? []).filter((s: any) => {
    const q = searchSaas.toLowerCase();
    return !q
      || (s.empresa_nome ?? "").toLowerCase().includes(q)
      || (s.empresa_slug ?? "").toLowerCase().includes(q)
      || (s.responsible_name ?? "").toLowerCase().includes(q)
      || (s.responsible_email ?? "").toLowerCase().includes(q);
  });

  return (
    <div>
      <PageHeader title="Cadastros" description="Empresas SaaS provisionadas" />

      <Card className="p-4">
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por empresa, slug, responsável ou email..." className="pl-9" value={searchSaas} onChange={(e) => setSearchSaas(e.target.value)} />
        </div>
        {loadingSaas ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Usuários</TableHead>
                <TableHead>Convidado em</TableHead>
                <TableHead>Ativado em</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSaas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum cadastro encontrado</TableCell>
                </TableRow>
              ) : (
                filteredSaas.map((s: any) => (
                  <TableRow key={s.empresa_id}>
                    <TableCell>
                      <div className="font-medium">{s.empresa_nome || "—"}</div>
                      <div className="text-xs text-muted-foreground">{s.empresa_slug ? `/${s.empresa_slug}` : "sem slug"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{s.responsible_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{s.responsible_email || "—"}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{s.saas_plans?.name || "—"}</Badge></TableCell>
                    <TableCell>{statusBadgeSaas(s.status)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{s.member_count ?? 0}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{fmt(s.invited_at)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{fmt(s.activated_at)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => { setManageEmpresa(s); setManageOpen(true); }}>
                        <Settings2 className="w-3 h-3 mr-1" />
                        Gerenciar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <SaasManageDialog open={manageOpen} onOpenChange={setManageOpen} empresa={manageEmpresa} />
    </div>
  );
}
