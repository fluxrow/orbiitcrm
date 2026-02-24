import { useState } from "react";
import { useOportunidadeItens, useDeleteOportunidadeItem } from "@/hooks/useOportunidadeItens";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ItemDialog } from "@/components/pe-admin/ItemDialog";

interface Props {
  oportunidade: any;
}

export function OportunidadeItensTab({ oportunidade }: Props) {
  const { data: itens, isLoading } = useOportunidadeItens(oportunidade.id);
  const deleteItem = useDeleteOportunidadeItem();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const formatCurrency = (v: number | null) =>
    v != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditingItem(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />Adicionar Item
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(itens || []).map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.produto_nome_snapshot || item.produtos?.nome || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.descricao || "—"}</TableCell>
                  <TableCell className="text-sm">{item.fornecedor || "—"}</TableCell>
                  <TableCell className="text-right">{item.quantidade}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(item.valor_unitario)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{formatCurrency(item.valor_total)}</TableCell>
                  <TableCell>
                    <Badge variant={item.status === "confirmed" ? "default" : item.status === "canceled" ? "destructive" : "secondary"}>
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingItem(item); setDialogOpen(true); }}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteItem.mutate({ id: item.id, oportunidade_id: oportunidade.id })}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!itens || itens.length === 0) && (
                <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nenhum item adicionado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <ItemDialog open={dialogOpen} onOpenChange={setDialogOpen} oportunidade={oportunidade} item={editingItem} />
    </div>
  );
}
