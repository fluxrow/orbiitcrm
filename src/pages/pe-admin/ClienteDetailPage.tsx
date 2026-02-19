import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCliente, useUpdateCliente } from "@/hooks/useClientes";
import { useContatos, useCreateContato } from "@/hooks/useContatos";
import { useClienteOrigens, useLinkClienteOrigem, useUnlinkClienteOrigem } from "@/hooks/useClienteOrigem";
import { useOrigens } from "@/hooks/useOrigens";
import { useSegmentos } from "@/hooks/useSegmentos";
import { usePeAuth } from "@/hooks/usePeAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId } = usePeAuth();
  const { data: cliente, isLoading } = useCliente(id);
  const { data: contatos } = useContatos({ cliente_id: id });
  const { data: origens } = useClienteOrigens(id);
  const { data: allOrigens } = useOrigens();
  const { data: segmentos } = useSegmentos();
  const updateCliente = useUpdateCliente();
  const createContato = useCreateContato();
  const linkOrigem = useLinkClienteOrigem();
  const unlinkOrigem = useUnlinkClienteOrigem();

  const [editForm, setEditForm] = useState<any>(null);
  const [contatoOpen, setContatoOpen] = useState(false);
  const [contatoForm, setContatoForm] = useState({ nome: "", cargo: "", email: "", telefone: "", whatsapp: "", decisor: false });
  const [origemOpen, setOrigemOpen] = useState(false);
  const [selectedOrigem, setSelectedOrigem] = useState("");

  if (isLoading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!cliente) return <div className="text-center py-12 text-muted-foreground">Cliente não encontrado</div>;

  const startEdit = () => setEditForm({ ...cliente });
  const saveEdit = async () => {
    if (!editForm) return;
    await updateCliente.mutateAsync({ id: editForm.id, razao_social: editForm.razao_social, nome_fantasia: editForm.nome_fantasia, cnpj: editForm.cnpj, site: editForm.site, cidade: editForm.cidade, uf: editForm.uf, porte: editForm.porte, segmento_id: editForm.segmento_id, status_geral: editForm.status_geral, observacoes: editForm.observacoes });
    setEditForm(null);
  };

  const saveContato = async () => {
    await createContato.mutateAsync({ organization_id: cliente.organization_id, cliente_id: cliente.id, ...contatoForm });
    setContatoOpen(false);
    setContatoForm({ nome: "", cargo: "", email: "", telefone: "", whatsapp: "", decisor: false });
  };

  const saveOrigem = async () => {
    if (!selectedOrigem) return;
    await linkOrigem.mutateAsync({ organization_id: cliente.organization_id, cliente_id: cliente.id, origem_id: selectedOrigem });
    setOrigemOpen(false);
    setSelectedOrigem("");
  };

  const data = editForm || cliente;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pe-admin/clientes")}><ArrowLeft className="w-4 h-4" /></Button>
        <h1 className="text-2xl font-bold text-foreground flex-1">{cliente.razao_social}</h1>
        {!editForm ? (
          <Button size="sm" onClick={startEdit}>Editar</Button>
        ) : (
          <Button size="sm" onClick={saveEdit}><Save className="w-4 h-4 mr-1" />Salvar</Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-card p-4 rounded-lg border">
        <div><label className="text-xs text-muted-foreground">Razão Social</label>
          {editForm ? <Input value={data.razao_social} onChange={e => setEditForm((f: any) => ({ ...f, razao_social: e.target.value }))} /> : <p className="font-medium text-sm">{data.razao_social}</p>}
        </div>
        <div><label className="text-xs text-muted-foreground">Nome Fantasia</label>
          {editForm ? <Input value={data.nome_fantasia || ""} onChange={e => setEditForm((f: any) => ({ ...f, nome_fantasia: e.target.value }))} /> : <p className="text-sm">{data.nome_fantasia || "—"}</p>}
        </div>
        <div><label className="text-xs text-muted-foreground">CNPJ</label>
          {editForm ? <Input value={data.cnpj || ""} onChange={e => setEditForm((f: any) => ({ ...f, cnpj: e.target.value }))} /> : <p className="text-sm">{data.cnpj || "—"}</p>}
        </div>
        <div><label className="text-xs text-muted-foreground">Status</label>
          {editForm ? (
            <Select value={data.status_geral} onValueChange={v => setEditForm((f: any) => ({ ...f, status_geral: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
                <SelectItem value="perdido">Perdido</SelectItem>
                <SelectItem value="cliente">Cliente</SelectItem>
              </SelectContent>
            </Select>
          ) : <Badge>{data.status_geral}</Badge>}
        </div>
        <div><label className="text-xs text-muted-foreground">Cidade/UF</label><p className="text-sm">{[data.cidade, data.uf].filter(Boolean).join("/") || "—"}</p></div>
        <div><label className="text-xs text-muted-foreground">Domínio</label><p className="text-sm">{data.dominio_principal || "—"}</p></div>
        <div><label className="text-xs text-muted-foreground">Segmento</label><p className="text-sm">{data.segmentos ? `${data.segmentos.macro}${data.segmentos.micro ? ` > ${data.segmentos.micro}` : ""}` : "—"}</p></div>
        <div><label className="text-xs text-muted-foreground">Porte</label><p className="text-sm">{data.porte || "—"}</p></div>
      </div>

      <Tabs defaultValue="contatos">
        <TabsList>
          <TabsTrigger value="contatos">Contatos ({contatos?.length || 0})</TabsTrigger>
          <TabsTrigger value="origens">Origens ({origens?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="contatos">
          <div className="flex justify-end mb-2">
            <Button size="sm" onClick={() => setContatoOpen(true)}><Plus className="w-4 h-4 mr-1" />Contato</Button>
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead><TableHead>Cargo</TableHead><TableHead>Email</TableHead><TableHead>Telefone</TableHead><TableHead>Decisor</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(contatos || []).map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>{c.cargo || "—"}</TableCell>
                  <TableCell>{c.email || "—"}</TableCell>
                  <TableCell>{c.telefone || c.whatsapp || "—"}</TableCell>
                  <TableCell>{c.decisor ? <Badge>Decisor</Badge> : "—"}</TableCell>
                </TableRow>
              ))}
              {(!contatos || contatos.length === 0) && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">Nenhum contato</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="origens">
          <div className="flex justify-end mb-2">
            <Button size="sm" onClick={() => setOrigemOpen(true)}><Plus className="w-4 h-4 mr-1" />Vincular Origem</Button>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Origem</TableHead><TableHead>Data</TableHead><TableHead className="w-16" /></TableRow></TableHeader>
            <TableBody>
              {(origens || []).map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.origens?.nome || "—"}</TableCell>
                  <TableCell>{new Date(o.data_importacao).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => unlinkOrigem.mutate(o.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
              {(!origens || origens.length === 0) && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Nenhuma origem vinculada</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      {/* Contato Dialog */}
      <Dialog open={contatoOpen} onOpenChange={setContatoOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Contato</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome *" value={contatoForm.nome} onChange={e => setContatoForm(f => ({ ...f, nome: e.target.value }))} />
            <Input placeholder="Cargo" value={contatoForm.cargo} onChange={e => setContatoForm(f => ({ ...f, cargo: e.target.value }))} />
            <Input placeholder="Email" value={contatoForm.email} onChange={e => setContatoForm(f => ({ ...f, email: e.target.value }))} />
            <Input placeholder="Telefone" value={contatoForm.telefone} onChange={e => setContatoForm(f => ({ ...f, telefone: e.target.value }))} />
            <Input placeholder="WhatsApp" value={contatoForm.whatsapp} onChange={e => setContatoForm(f => ({ ...f, whatsapp: e.target.value }))} />
            <div className="flex items-center gap-2"><Switch checked={contatoForm.decisor} onCheckedChange={v => setContatoForm(f => ({ ...f, decisor: v }))} /><span className="text-sm">Decisor</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContatoOpen(false)}>Cancelar</Button>
            <Button onClick={saveContato} disabled={!contatoForm.nome}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Origem Dialog */}
      <Dialog open={origemOpen} onOpenChange={setOrigemOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vincular Origem</DialogTitle></DialogHeader>
          <Select value={selectedOrigem} onValueChange={setSelectedOrigem}>
            <SelectTrigger><SelectValue placeholder="Selecione uma origem" /></SelectTrigger>
            <SelectContent>{(allOrigens || []).map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrigemOpen(false)}>Cancelar</Button>
            <Button onClick={saveOrigem} disabled={!selectedOrigem}>Vincular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
