import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateInteracao } from "@/hooks/useInteracoes";

const schema = z.object({
  tipo: z.string().min(1),
  resumo: z.string().min(3, "Resumo obrigatório"),
  proxima_acao: z.string().optional(),
  data_followup: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  oportunidade: any;
}

export function InteracaoDialog({ open, onOpenChange, oportunidade }: Props) {
  const create = useCreateInteracao();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo: "call", resumo: "", proxima_acao: "", data_followup: "" },
  });

  const onSubmit = async (data: FormData) => {
    await create.mutateAsync({
      organization_id: oportunidade.organization_id,
      cliente_id: oportunidade.cliente_id,
      oportunidade_id: oportunidade.id,
      tipo: data.tipo,
      resumo: data.resumo,
      proxima_acao: data.proxima_acao,
      data_followup: data.data_followup || undefined,
    });
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova Interação</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="tipo" render={({ field }) => (
              <FormItem><FormLabel>Tipo</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="call">Ligação</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="meeting">Reunião</SelectItem>
                    <SelectItem value="note">Nota</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            <FormField control={form.control} name="resumo" render={({ field }) => (
              <FormItem><FormLabel>Resumo *</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="proxima_acao" render={({ field }) => (
              <FormItem><FormLabel>Próxima Ação</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="data_followup" render={({ field }) => (
              <FormItem><FormLabel>Data Follow-up</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
            )} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando..." : "Registrar"}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
