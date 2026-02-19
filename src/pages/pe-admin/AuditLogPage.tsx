import { useState } from "react";
import { useAuditLog } from "@/hooks/usePeAuditLog";
import { useOrganizations } from "@/hooks/useOrganizations";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function AuditLogPage() {
  const { data: orgs } = useOrganizations();
  const [orgFilter, setOrgFilter] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: logs, isLoading } = useAuditLog(
    orgFilter || null,
    { startDate: startDate || undefined, endDate: endDate || undefined }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Auditoria</h1>
        <p className="text-sm text-muted-foreground">Log de ações realizadas no sistema</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <Label className="text-xs">Organização</Label>
          <select
            className="block mt-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
          >
            <option value="">Todas</option>
            {orgs?.map((o: any) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">De</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" />
        </div>
      </div>

      <div className="border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>Organização</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : !logs?.length ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum registro</TableCell></TableRow>
            ) : (
              logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(log.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell className="text-foreground">{log.pe_users?.full_name || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{log.action}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{log.entity_type}</TableCell>
                  <TableCell className="text-muted-foreground">{log.organizations?.name || "Global"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
