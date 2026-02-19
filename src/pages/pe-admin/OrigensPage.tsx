import { useState } from "react";
import { useOrigens, useCreateOrigem, useUpdateOrigem, useDeleteOrigem } from "@/hooks/useOrigens";
import { usePeAuth } from "@/hooks/usePeAuth";
import { useOrganizations } from "@/hooks/useOrganizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";

export default function OrigensPage() {
  const { isSuperAdmin, orgId } = usePeAuth();
  const { data: orgs } = useOrganizations();
  const { data: origens, isLoading } = useOrigens();
  const createO = useCreateOrigem();
  const updateO = useUpdateOrigem();
  const deleteO = useDeleteOrigem();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", descricao: "", organization_id: "" });

  const openNew = () => { setEditing(null); setForm({ nome: "", descricao: "", organization_id: orgId || "" }); setOpen(true); };
  const openEdit = (o: any) => { setEditing(o); setForm({ nome: o.nome, descricao: o.descricao || "", organization_id: o.organization_id }); setOpen(true); };
  const save = async () => {
    if (editing) await updateO.mutateAsync({ id: editing.id, nome: form.nome, descricao: form.descricao || undefined });
    else await createO.mutateAsync({ organization_id: form.organization_id, nome: form.nome, descricao: form.descricao || undefined });
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Origens</h1>
        <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" />Nova</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(origens || []).map((o: any) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.nome}</TableCell>
                <TableCell>{o.descricao || "—"}</TableCell>
                <TableCell><Switch checked={o.is_active} onCheckedChange={(v) => updateO.mutate({ id: o.id, is_active: v })} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(o)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteO.mutate(o.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!origens || origens.length === 0) && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma origem cadastrada</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Nova"} Origem</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {isSuperAdmin && !editing && (
              <Select value={form.organization_id} onValueChange={(v) => setForm(f => ({ ...f, organization_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Organização" /></SelectTrigger>
                <SelectContent>{(orgs || []).map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Input placeholder="Nome (ex: Panrotas)" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            <Input placeholder="Descrição (opcional)" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!form.nome || !form.organization_id}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
