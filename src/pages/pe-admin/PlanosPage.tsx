import { useState } from "react";
import { useSaasPlans, useCreateSaasPlan, useUpdateSaasPlan } from "@/hooks/useSaasPlans";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { SaasPlan } from "@/hooks/useSaasPlans";

interface PlanForm {
  code: string;
  name: string;
  features: string;
  limits: string;
}

const emptyForm: PlanForm = { code: "", name: "", features: "{}", limits: "{}" };

export default function PlanosPage() {
  const { data: plans, isLoading } = useSaasPlans();
  const createPlan = useCreateSaasPlan();
  const updatePlan = useUpdateSaasPlan();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SaasPlan | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (plan: SaasPlan) => {
    setEditing(plan);
    setForm({
      code: plan.code,
      name: plan.name,
      features: JSON.stringify(plan.features, null, 2),
      limits: JSON.stringify(plan.limits, null, 2),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    let features: Record<string, boolean>;
    let limits: Record<string, number>;
    try {
      features = JSON.parse(form.features);
      limits = JSON.parse(form.limits);
    } catch {
      toast.error("JSON inválido em features ou limits");
      return;
    }

    try {
      if (editing) {
        await updatePlan.mutateAsync({ id: editing.id, code: form.code, name: form.name, features, limits });
        toast.success("Plano atualizado!");
      } else {
        await createPlan.mutateAsync({ code: form.code, name: form.name, features, limits });
        toast.success("Plano criado!");
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar plano");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planos</h1>
          <p className="text-sm text-muted-foreground">Gerencie os planos SaaS disponíveis</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Novo Plano
        </Button>
      </div>

      <div className="border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Features</TableHead>
              <TableHead>Limites</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : !plans?.length ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum plano cadastrado</TableCell></TableRow>
            ) : (
              plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell><Badge variant="outline">{plan.code}</Badge></TableCell>
                  <TableCell className="font-medium text-foreground">{plan.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {Object.entries(plan.features).filter(([, v]) => v).map(([k]) => k).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {Object.entries(plan.limits).map(([k, v]) => `${k}: ${v}`).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(plan)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Plano" : "Novo Plano"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Código</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="basic" />
              </div>
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Plano Basic" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Features (JSON)</Label>
              <Textarea
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
                className="font-mono text-xs min-h-[100px]"
                placeholder='{"email": true, "whatsapp": false}'
              />
            </div>
            <div className="space-y-2">
              <Label>Limites (JSON)</Label>
              <Textarea
                value={form.limits}
                onChange={(e) => setForm({ ...form, limits: e.target.value })}
                className="font-mono text-xs min-h-[100px]"
                placeholder='{"max_users": 5, "max_emails": 1000}'
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={createPlan.isPending || updatePlan.isPending}>
                {createPlan.isPending || updatePlan.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
