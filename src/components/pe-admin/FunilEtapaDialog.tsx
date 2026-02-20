import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateFunilEtapa, useUpdateFunilEtapa } from "@/hooks/useFunilEtapas";
import { usePeAuth } from "@/hooks/usePeAuth";

const schema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  ordem: z.number().min(1, "Ordem obrigatória"),
  tipo: z.string().min(1),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  etapa?: any;
}

export function FunilEtapaDialog({ open, onOpenChange, etapa }: Props) {
  const { orgId } = usePeAuth();
  const create = useCreateFunilEtapa();
  const update = useUpdateFunilEtapa();
  const isEditing = !!etapa;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", ordem: 1, tipo: "open" },
  });

  useEffect(() => {
    if (etapa) {
      form.reset({ nome: etapa.nome, ordem: etapa.ordem, tipo: etapa.tipo });
    } else {
      form.reset({ nome: "", ordem: 1, tipo: "open" });
    }
  }, [etapa, form]);

  const onSubmit = async (data: FormData) => {
    if (isEditing) {
      await update.mutateAsync({ id: etapa.id, nome: data.nome, ordem: data.ordem, tipo: data.tipo });
    } else if (orgId) {
      await create.mutateAsync({ organization_id: orgId, nome: data.nome, ordem: data.ordem, tipo: data.tipo });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEditing ? "Editar Etapa" : "Nova Etapa"}</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="nome" render={({ field }) => (
              <FormItem><FormLabel>Nome</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="ordem" render={({ field }) => (
              <FormItem><FormLabel>Ordem</FormLabel><FormControl><Input type="number" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 1)} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="tipo" render={({ field }) => (
              <FormItem><FormLabel>Tipo</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select><FormMessage />
              </FormItem>
            )} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {create.isPending || update.isPending ? "Salvando..." : isEditing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
