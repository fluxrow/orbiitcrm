import { useState, useMemo } from "react";
import { useEmpresas } from "@/hooks/useSuperAdmin";
import { useOrganizations } from "@/hooks/useOrganizations";
import { useTenantMaps, useUpsertTenantMap, useDeleteTenantMap } from "@/hooks/useTenantMap";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link2, Save, Trash2, Loader2 } from "lucide-react";

export default function TenantMapPage() {
  const { data: empresas, isLoading: loadingEmpresas } = useEmpresas();
  const { data: orgs, isLoading: loadingOrgs } = useOrganizations();
  const { data: maps, isLoading: loadingMaps } = useTenantMaps();
  const upsert = useUpsertTenantMap();
  const remove = useDeleteTenantMap();

  const [selections, setSelections] = useState<Record<string, string>>({});

  const mapByEmpresa = useMemo(() => {
    const m: Record<string, string> = {};
    maps?.forEach((tm: any) => { m[tm.empresa_id] = tm.organization_id; });
    return m;
  }, [maps]);

  const mappedOrgIds = useMemo(() => new Set(Object.values(mapByEmpresa)), [mapByEmpresa]);

  const isLoading = loadingEmpresas || loadingOrgs || loadingMaps;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSave = (empresaId: string) => {
    const orgId = selections[empresaId];
    if (!orgId) return;
    upsert.mutate({ empresa_id: empresaId, organization_id: orgId });
  };

  const handleRemove = (empresaId: string) => {
    remove.mutate(empresaId);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tenant Map</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie o mapeamento entre empresas Orbit e organizações PE.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" />
            Empresas × Organizações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa (Orbit)</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Organização (PE)</TableHead>
                <TableHead className="w-[140px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {empresas?.map((emp: any) => {
                const currentOrgId = mapByEmpresa[emp.id];
                const isMapped = !!currentOrgId;
                const selectedOrgId = selections[emp.id] ?? "";

                return (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.nome}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {emp.cnpj || "—"}
                    </TableCell>
                    <TableCell>
                      {isMapped ? (
                        <Badge className="bg-primary/15 text-primary border-primary/30">
                          Mapeado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Não mapeado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {isMapped ? (
                        <span className="text-sm">
                          {orgs?.find((o: any) => o.id === currentOrgId)?.name || currentOrgId}
                        </span>
                      ) : (
                        <Select
                          value={selectedOrgId}
                          onValueChange={(v) =>
                            setSelections((prev) => ({ ...prev, [emp.id]: v }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecionar organização..." />
                          </SelectTrigger>
                          <SelectContent>
                            {orgs
                              ?.filter((o: any) => !mappedOrgIds.has(o.id))
                              .map((o: any) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {isMapped ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(emp.id)}
                          disabled={remove.isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remover
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleSave(emp.id)}
                          disabled={!selectedOrgId || upsert.isPending}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Mapear
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!empresas || empresas.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhuma empresa encontrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
