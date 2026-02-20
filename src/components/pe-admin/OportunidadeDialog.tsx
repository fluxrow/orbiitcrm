import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useCreateOportunidade, useUpdateOportunidade } from "@/hooks/useOportunidades";
import { useFunilEtapas } from "@/hooks/useFunilEtapas";
import { useClientes } from "@/hooks/useClientes";
import { usePeAuth } from "@/hooks/usePeAuth";
import { useAuth } from "@/hooks/useAuth";

const schema = z.object({
  titulo: z.string().min(2, "Título obrigatório"),
  cliente_id: z.string().min(1, "Cliente obrigatório"),
  etapa_id: z.string().min(1, "Etapa obrigatória"),
  destino: z.string().optional(),
  data_ida: z.string().optional(),
  data_volta: z.string().optional(),
  viajantes_qtd: z.number().optional(),
  probabilidade: z.number().min(0).max(100),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  oportunidade?: any;
}

export function OportunidadeDialog({ open, onOpenChange, oportunidade }: Props) {
  const { orgId } = usePeAuth();
  const { user } = useAuth();
  const create = useCreateOportunidade();
  const update = useUpdateOportunidade();
  const { data: etapas } = useFunilEtapas();
  const { data: clientes } = useClientes();
  const isEditing = !!oportunidade;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { titulo: "", cliente_id: "", etapa_id: "", destino: "", data_ida: "", data_volta: "", viajantes_qtd: undefined, probabilidade: 10 },
  });

  useEffect(() => {
    if (oportunidade) {
      form.reset({
        titulo: oportunidade.titulo,
        cliente_id: oportunidade.cliente_id,
        etapa_id: oportunidade.etapa_id,
        destino: oportunidade.destino || "",
        data_ida: oportunidade.data_ida || "",
        data_volta: oportunidade.data_volta || "",
        viajantes_qtd: oportunidade.viajantes_qtd || undefined,
        probabilidade: oportunidade.probabilidade || 10,
      });
    } else {
      form.reset({ titulo: "", cliente_id: "", etapa_id: etapas?.[0]?.id || "", destino: "", data_ida: "", data_volta: "", viajantes_qtd: undefined, probabilidade: 10 });
    }
  }, [oportunidade, etapas, form]);

  const onSubmit = async (data: FormData) => {
    if (isEditing) {
      await update.mutateAsync({ id: oportunidade.id, titulo: data.titulo, cliente_id: data.cliente_id, etapa_id: data.etapa_id, destino: data.destino, data_ida: data.data_ida, data_volta: data.data_volta, viajantes_qtd: data.viajantes_qtd || null, probabilidade: data.probabilidade });
    } else if (orgId && user?.id) {
      await create.mutateAsync({ organization_id: orgId, owner_user_id: user.id, titulo: data.titulo, cliente_id: data.cliente_id, etapa_id: data.etapa_id, destino: data.destino, data_ida: data.data_ida, data_volta: data.data_volta, viajantes_qtd: data.viajantes_qtd, probabilidade: data.probabilidade });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isEditing ? "Editar Oportunidade" : "Nova Oportunidade"}</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="titulo" render={({ field }) => (
              <FormItem><FormLabel>Título *</FormLabel><FormControl><Input placeholder="Ex: Viagem São Paulo - Equipe Vendas" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="cliente_id" render={({ field }) => (
                <FormItem><FormLabel>Cliente *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                    <SelectContent>{(clientes || []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</SelectItem>)}</SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="etapa_id" render={({ field }) => (
                <FormItem><FormLabel>Etapa *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                    <SelectContent>{(etapas || []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="destino" render={({ field }) => (
              <FormItem><FormLabel>Destino</FormLabel><FormControl><Input placeholder="Ex: São Paulo - SP" {...field} /></FormControl></FormItem>
            )} />
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="data_ida" render={({ field }) => (
                <FormItem><FormLabel>Data Ida</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="data_volta" render={({ field }) => (
                <FormItem><FormLabel>Data Volta</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="viajantes_qtd" render={({ field }) => (
                <FormItem><FormLabel>Viajantes</FormLabel><FormControl><Input type="number" placeholder="0" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)} /></FormControl></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="probabilidade" render={({ field }) => (
              <FormItem><FormLabel>Probabilidade: {field.value}%</FormLabel><FormControl>
                <Slider value={[field.value]} onValueChange={(v) => field.onChange(v[0])} max={100} step={5} className="mt-2" />
              </FormControl></FormItem>
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
