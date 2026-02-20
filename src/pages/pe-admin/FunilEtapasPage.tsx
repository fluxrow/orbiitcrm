import { useState } from "react";
import { useFunilEtapas, useCreateFunilEtapa, useUpdateFunilEtapa, useDeleteFunilEtapa, useCreateDefaultStages } from "@/hooks/useFunilEtapas";
import { usePeAuth } from "@/hooks/usePeAuth";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Wand2 } from "lucide-react";
import { FunilEtapaDialog } from "@/components/pe-admin/FunilEtapaDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TIPO_BADGE: Record<string, "default" | "secondary" | "destructive"> = {
  open: "default",
  won: "secondary",
  lost: "destructive",
};

export default function FunilEtapasPage() {
  const { orgId } = usePeAuth();
  const { data: etapas, isLoading } = useFunilEtapas();
  const createDefaults = useCreateDefaultStages();
  const deleteEtapa = useDeleteFunilEtapa();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEtapa, setEditingEtapa] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Etapas do Funil</h1>
          <p className="text-muted-foreground">Configure as etapas do pipeline de oportunidades</p>
        </div>
        <div className="flex gap-2">
          {orgId && (!etapas || etapas.length === 0) && (
            <Button variant="outline" onClick={() => createDefaults.mutate(orgId)} disabled={createDefaults.isPending}>
              <Wand2 className="w-4 h-4 mr-2" />
              Criar Etapas Padrão
            </Button>
          )}
          <Button onClick={() => { setEditingEtapa(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Etapa
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Ordem</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(etapas || []).map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono">{e.ordem}</TableCell>
                  <TableCell className="font-medium">{e.nome}</TableCell>
                  <TableCell><Badge variant={TIPO_BADGE[e.tipo] || "default"}>{e.tipo}</Badge></TableCell>
                  <TableCell><Badge variant={e.is_active ? "default" : "secondary"}>{e.is_active ? "Ativo" : "Inativo"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingEtapa(e); setDialogOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(e.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <FunilEtapaDialog open={dialogOpen} onOpenChange={setDialogOpen} etapa={editingEtapa} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza? Oportunidades nesta etapa ficarão órfãs.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) { deleteEtapa.mutate(deleteId); setDeleteId(null); } }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
