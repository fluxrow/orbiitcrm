import { useState } from "react";
import { useClientes, ClienteFilters } from "@/hooks/useClientes";
import { useCreateCliente } from "@/hooks/useClientes";
import { useSegmentos } from "@/hooks/useSegmentos";
import { usePeAuth } from "@/hooks/usePeAuth";
import { useOrganizations } from "@/hooks/useOrganizations";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "perdido", label: "Perdido" },
  { value: "cliente", label: "Cliente" },
];

export default function ClientesPage() {
  const navigate = useNavigate();
  const { isSuperAdmin, orgId } = usePeAuth();
  const { data: orgs } = useOrganizations();
  const { data: segmentos } = useSegmentos();

  const [filters, setFilters] = useState<ClienteFilters>({});
  const [search, setSearch] = useState("");
  const { data: clientes, isLoading } = useClientes({ ...filters, search: search || undefined });
  const createCliente = useCreateCliente();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ razao_social: "", nome_fantasia: "", cnpj: "", site: "", cidade: "", uf: "", segmento_id: "", porte: "", organization_id: "" });

  const openNew = () => {
    setForm({ razao_social: "", nome_fantasia: "", cnpj: "", site: "", cidade: "", uf: "", segmento_id: "", porte: "", organization_id: orgId || "" });
    setOpen(true);
  };

  const save = async () => {
    await createCliente.mutateAsync({
      organization_id: form.organization_id,
      razao_social: form.razao_social,
      nome_fantasia: form.nome_fantasia || undefined,
      cnpj: form.cnpj || undefined,
      site: form.site || undefined,
      cidade: form.cidade || undefined,
      uf: form.uf || undefined,
      segmento_id: form.segmento_id || undefined,
      porte: form.porte || undefined,
    });
    setOpen(false);
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = { ativo: "default", inativo: "secondary", perdido: "destructive", cliente: "outline" };
    return (map[s] || "default") as any;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
        <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" />Novo</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CNPJ ou domínio..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filters.status_geral || ""} onValueChange={v => setFilters(f => ({ ...f, status_geral: v || undefined }))}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.segmento_id || ""} onValueChange={v => setFilters(f => ({ ...f, segmento_id: v || undefined }))}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Segmento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            {(segmentos || []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.macro}{s.micro ? ` > ${s.micro}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="UF" className="w-[80px]" value={filters.uf || ""} onChange={e => setFilters(f => ({ ...f, uf: e.target.value || undefined }))} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Razão Social</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead>Segmento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(clientes || []).map((c: any) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/pe-admin/clientes/${c.id}`)}>
                <TableCell>
                  <div>
                    <span className="font-medium">{c.razao_social}</span>
                    {c.nome_fantasia && <span className="text-muted-foreground text-xs ml-2">({c.nome_fantasia})</span>}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{c.cnpj || "—"}</TableCell>
                <TableCell className="text-sm">{[c.cidade, c.uf].filter(Boolean).join("/") || "—"}</TableCell>
                <TableCell className="text-sm">{c.segmentos ? `${c.segmentos.macro}${c.segmentos.micro ? ` > ${c.segmentos.micro}` : ""}` : "—"}</TableCell>
                <TableCell><Badge variant={statusColor(c.status_geral)}>{c.status_geral}</Badge></TableCell>
                <TableCell><Button variant="ghost" size="icon"><Eye className="w-4 h-4" /></Button></TableCell>
              </TableRow>
            ))}
            {(!clientes || clientes.length === 0) && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {isSuperAdmin && (
              <div className="col-span-2">
                <Select value={form.organization_id} onValueChange={v => setForm(f => ({ ...f, organization_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Organização" /></SelectTrigger>
                  <SelectContent>{(orgs || []).map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2"><Input placeholder="Razão Social *" value={form.razao_social} onChange={e => setForm(f => ({ ...f, razao_social: e.target.value }))} /></div>
            <Input placeholder="Nome Fantasia" value={form.nome_fantasia} onChange={e => setForm(f => ({ ...f, nome_fantasia: e.target.value }))} />
            <Input placeholder="CNPJ" value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} />
            <Input placeholder="Site" value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))} />
            <Input placeholder="Porte" value={form.porte} onChange={e => setForm(f => ({ ...f, porte: e.target.value }))} />
            <Input placeholder="Cidade" value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} />
            <Input placeholder="UF" value={form.uf} onChange={e => setForm(f => ({ ...f, uf: e.target.value }))} />
            <div className="col-span-2">
              <Select value={form.segmento_id} onValueChange={v => setForm(f => ({ ...f, segmento_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Segmento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum</SelectItem>
                  {(segmentos || []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.macro}{s.micro ? ` > ${s.micro}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!form.razao_social || !form.organization_id}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
