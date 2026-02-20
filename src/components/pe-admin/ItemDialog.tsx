import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateOportunidadeItem, useUpdateOportunidadeItem } from "@/hooks/useOportunidadeItens";
import { useProdutos } from "@/hooks/useProdutos";

const schema = z.object({
  produto_id: z.string().min(1, "Produto obrigatório"),
  descricao: z.string().optional(),
  quantidade: z.number().min(1),
  valor_unitario: z.number().min(0).optional(),
  fornecedor: z.string().optional(),
  status: z.string(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  oportunidade: any;
  item?: any;
}

export function ItemDialog({ open, onOpenChange, oportunidade, item }: Props) {
  const create = useCreateOportunidadeItem();
  const update = useUpdateOportunidadeItem();
  const { data: produtos } = useProdutos();
  const isEditing = !!item;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { produto_id: "", descricao: "", quantidade: 1, valor_unitario: undefined, fornecedor: "", status: "open" },
  });

  useEffect(() => {
    if (item) {
      form.reset({
        produto_id: item.produto_id,
        descricao: item.descricao || "",
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario ? Number(item.valor_unitario) : undefined,
        fornecedor: item.fornecedor || "",
        status: item.status,
      });
    } else {
      form.reset({ produto_id: "", descricao: "", quantidade: 1, valor_unitario: undefined, fornecedor: "", status: "open" });
    }
  }, [item, form]);

  const onSubmit = async (data: FormData) => {
    if (isEditing) {
      await update.mutateAsync({ id: item.id, oportunidade_id: oportunidade.id, quantidade: data.quantidade, valor_unitario: data.valor_unitario, descricao: data.descricao, fornecedor: data.fornecedor, status: data.status });
    } else {
      await create.mutateAsync({
        organization_id: oportunidade.organization_id,
        oportunidade_id: oportunidade.id,
        produto_id: data.produto_id,
        quantidade: data.quantidade,
        descricao: data.descricao,
        valor_unitario: data.valor_unitario,
        fornecedor: data.fornecedor,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEditing ? "Editar Item" : "Novo Item"}</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="produto_id" render={({ field }) => (
              <FormItem><FormLabel>Produto *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                  <SelectContent>{(produtos || []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                </Select><FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="descricao" render={({ field }) => (
              <FormItem><FormLabel>Descrição</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="quantidade" render={({ field }) => (
                <FormItem><FormLabel>Quantidade</FormLabel><FormControl><Input type="number" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 1)} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="valor_unitario" render={({ field }) => (
                <FormItem><FormLabel>Valor Unitário</FormLabel><FormControl><Input type="number" step="0.01" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)} /></FormControl></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="fornecedor" render={({ field }) => (
              <FormItem><FormLabel>Fornecedor</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem><FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {create.isPending || update.isPending ? "Salvando..." : isEditing ? "Salvar" : "Adicionar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
