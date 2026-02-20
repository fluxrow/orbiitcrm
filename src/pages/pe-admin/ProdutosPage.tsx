import { useState } from "react";
import { useProdutos, useCreateProduto, useUpdateProduto, useDeleteProduto, useCreateDefaultProducts } from "@/hooks/useProdutos";
import { usePeAuth } from "@/hooks/usePeAuth";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, Pencil, Trash2, Wand2 } from "lucide-react";
import { ProdutoDialog } from "@/components/pe-admin/ProdutoDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CATEGORIA_LABELS: Record<string, string> = {
  TRANSPORTE: "Transporte",
  HOSPEDAGEM: "Hospedagem",
  PROTECAO: "Proteção",
  EVENTOS: "Eventos",
  SERVICOS: "Serviços",
};

export default function ProdutosPage() {
  const { orgId } = usePeAuth();
  const { data: produtos, isLoading } = useProdutos();
  const createDefaults = useCreateDefaultProducts();
  const deleteProduto = useDeleteProduto();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduto, setEditingProduto] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const grouped = (produtos || []).reduce((acc: Record<string, any[]>, p: any) => {
    const cat = p.categoria || "OUTROS";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Produtos</h1>
          <p className="text-muted-foreground">Tipos de serviço disponíveis para oportunidades</p>
        </div>
        <div className="flex gap-2">
          {orgId && (!produtos || produtos.length === 0) && (
            <Button variant="outline" onClick={() => createDefaults.mutate(orgId)} disabled={createDefaults.isPending}>
              <Wand2 className="w-4 h-4 mr-2" />
              Criar Produtos Padrão
            </Button>
          )}
          <Button onClick={() => { setEditingProduto(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Produto
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">{CATEGORIA_LABELS[cat] || cat}</h2>
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(items as any[]).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.codigo}</code></TableCell>
                      <TableCell>
                        <Badge variant={p.is_active ? "default" : "secondary"}>
                          {p.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingProduto(p); setDialogOpen(true); }}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(p.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ))
      )}

      <ProdutoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        produto={editingProduto}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir este produto?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) { deleteProduto.mutate(deleteId); setDeleteId(null); } }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
