import { useState } from "react";
import { useContatos, ContatoFilters } from "@/hooks/useContatos";
import { useClientes } from "@/hooks/useClientes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

export default function ContatosPage() {
  const [filters, setFilters] = useState<ContatoFilters>({});
  const [search, setSearch] = useState("");
  const { data: contatos, isLoading } = useContatos({ ...filters, search: search || undefined });
  const { data: clientes } = useClientes();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Contatos</h1>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, email, telefone..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filters.decisor === undefined ? "" : filters.decisor ? "true" : "false"} onValueChange={v => setFilters(f => ({ ...f, decisor: v === "" ? undefined : v === "true" }))}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Decisor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            <SelectItem value="true">Decisores</SelectItem>
            <SelectItem value="false">Não decisores</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.cliente_id || ""} onValueChange={v => setFilters(f => ({ ...f, cliente_id: v || undefined }))}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            {(clientes || []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Decisor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(contatos || []).map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell>{c.cargo || "—"}</TableCell>
                <TableCell>{c.email || "—"}</TableCell>
                <TableCell>{c.telefone || c.whatsapp || "—"}</TableCell>
                <TableCell className="text-sm">{c.clientes?.razao_social || "—"}</TableCell>
                <TableCell>{c.decisor ? <Badge>Decisor</Badge> : "—"}</TableCell>
              </TableRow>
            ))}
            {(!contatos || contatos.length === 0) && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum contato encontrado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
