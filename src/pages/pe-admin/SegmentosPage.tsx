import { useState } from "react";
import { useSegmentos, useCreateSegmento, useUpdateSegmento, useDeleteSegmento } from "@/hooks/useSegmentos";
import { usePeAuth } from "@/hooks/usePeAuth";
import { useOrganizations } from "@/hooks/useOrganizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";

export default function SegmentosPage() {
  const { isSuperAdmin, orgId } = usePeAuth();
  const { data: orgs } = useOrganizations();
  const { data: segmentos, isLoading } = useSegmentos();
  const createSeg = useCreateSegmento();
  const updateSeg = useUpdateSegmento();
  const deleteSeg = useDeleteSegmento();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ macro: "", micro: "", organization_id: "" });

  const openNew = () => {
    setEditing(null);
    setForm({ macro: "", micro: "", organization_id: orgId || "" });
    setOpen(true);
  };
  const openEdit = (s: any) => {
    setEditing(s);
    setForm({ macro: s.macro, micro: s.micro || "", organization_id: s.organization_id });
    setOpen(true);
  };
  const save = async () => {
    if (editing) {
      await updateSeg.mutateAsync({ id: editing.id, macro: form.macro, micro: form.micro || undefined });
    } else {
      await createSeg.mutateAsync({ organization_id: form.organization_id, macro: form.macro, micro: form.micro || undefined });
    }
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Segmentos</h1>
        <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" />Novo</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Macro</TableHead>
              <TableHead>Micro</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(segmentos || []).map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.macro}</TableCell>
                <TableCell>{s.micro || "—"}</TableCell>
                <TableCell>
                  <Switch checked={s.is_active} onCheckedChange={(v) => updateSeg.mutate({ id: s.id, is_active: v })} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteSeg.mutate(s.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!segmentos || segmentos.length === 0) && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum segmento cadastrado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} Segmento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {isSuperAdmin && !editing && (
              <Select value={form.organization_id} onValueChange={(v) => setForm(f => ({ ...f, organization_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Organização" /></SelectTrigger>
                <SelectContent>{(orgs || []).map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Input placeholder="Macro (ex: Construção)" value={form.macro} onChange={e => setForm(f => ({ ...f, macro: e.target.value }))} />
            <Input placeholder="Micro (opcional)" value={form.micro} onChange={e => setForm(f => ({ ...f, micro: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!form.macro || !form.organization_id}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
