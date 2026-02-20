import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCreateProduto, useUpdateProduto } from "@/hooks/useProdutos";
import { usePeAuth } from "@/hooks/usePeAuth";

const schema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  codigo: z.string().min(2, "Código obrigatório"),
  categoria: z.string().min(1, "Categoria obrigatória"),
  is_active: z.boolean(),
});

type FormData = z.infer<typeof schema>;

const CATEGORIAS = [
  { value: "TRANSPORTE", label: "Transporte" },
  { value: "HOSPEDAGEM", label: "Hospedagem" },
  { value: "PROTECAO", label: "Proteção" },
  { value: "EVENTOS", label: "Eventos" },
  { value: "SERVICOS", label: "Serviços" },
];

interface ProdutoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produto?: any;
}

export function ProdutoDialog({ open, onOpenChange, produto }: ProdutoDialogProps) {
  const { orgId } = usePeAuth();
  const createProduto = useCreateProduto();
  const updateProduto = useUpdateProduto();
  const isEditing = !!produto;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", codigo: "", categoria: "TRANSPORTE", is_active: true },
  });

  useEffect(() => {
    if (produto) {
      form.reset({ nome: produto.nome, codigo: produto.codigo, categoria: produto.categoria, is_active: produto.is_active });
    } else {
      form.reset({ nome: "", codigo: "", categoria: "TRANSPORTE", is_active: true });
    }
  }, [produto, form]);

  const onSubmit = async (data: FormData) => {
    if (isEditing) {
      await updateProduto.mutateAsync({ id: produto.id, ...data });
    } else if (orgId) {
      await createProduto.mutateAsync({ organization_id: orgId, nome: data.nome, codigo: data.codigo, categoria: data.categoria });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Produto" : "Novo Produto"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="nome" render={({ field }) => (
              <FormItem><FormLabel>Nome</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="codigo" render={({ field }) => (
              <FormItem><FormLabel>Código</FormLabel><FormControl><Input {...field} placeholder="Ex: AEREO" /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="categoria" render={({ field }) => (
              <FormItem><FormLabel>Categoria</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select><FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="is_active" render={({ field }) => (
              <FormItem className="flex items-center gap-3">
                <FormLabel>Ativo</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={createProduto.isPending || updateProduto.isPending}>
                {createProduto.isPending || updateProduto.isPending ? "Salvando..." : isEditing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
