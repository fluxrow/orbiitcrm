import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useCreateDeal, useUpdateDeal, useOrbitPipelineStages } from "@/hooks/useOrbitDeals";
import { useOrbitProspects } from "@/hooks/useOrbitProspects";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

const dealSchema = z.object({
  titulo: z.string().min(2, "Título é obrigatório") as z.ZodType<string>,
  valor_estimado: z.number().min(0).optional(),
  etapa_id: z.string().optional(),
  prospect_id: z.string().optional(),
  probabilidade: z.number().min(0).max(100).optional(),
  data_prevista_fechamento: z.string().optional(),
});

type DealFormData = z.infer<typeof dealSchema>;

interface DealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Tables<"orbit_deals"> | null;
  defaultEtapaId?: string;
}

export function DealDialog({ open, onOpenChange, deal, defaultEtapaId }: DealDialogProps) {
  const createDeal = useCreateDeal();
  const updateDeal = useUpdateDeal();
  const { data: stages } = useOrbitPipelineStages();
  const { data: prospects } = useOrbitProspects();
  const isEditing = !!deal;

  const form = useForm<DealFormData>({
    resolver: zodResolver(dealSchema),
    defaultValues: {
      titulo: "",
      valor_estimado: 0,
      etapa_id: defaultEtapaId || "",
      prospect_id: "",
      probabilidade: 50,
      data_prevista_fechamento: "",
    },
  });

  useEffect(() => {
    if (deal) {
      form.reset({
        titulo: deal.titulo || "",
        valor_estimado: deal.valor_estimado ? Number(deal.valor_estimado) : 0,
        etapa_id: deal.etapa_id || "",
        prospect_id: deal.prospect_id || "",
        probabilidade: deal.probabilidade || 50,
        data_prevista_fechamento: deal.data_prevista_fechamento || "",
      });
    } else {
      form.reset({
        titulo: "",
        valor_estimado: 0,
        etapa_id: defaultEtapaId || stages?.[0]?.id || "",
        prospect_id: "",
        probabilidade: 50,
        data_prevista_fechamento: "",
      });
    }
  }, [deal, defaultEtapaId, stages, form]);

  const onSubmit = async (data: DealFormData) => {
    try {
      const payload = {
        ...data,
        valor_estimado: data.valor_estimado || null,
        etapa_id: data.etapa_id || null,
        prospect_id: data.prospect_id || null,
        data_prevista_fechamento: data.data_prevista_fechamento || null,
      };

      if (isEditing && deal) {
        await updateDeal.mutateAsync({ id: deal.id, ...payload });
        toast.success("Oportunidade atualizada!");
      } else {
        await createDeal.mutateAsync({ ...payload, titulo: data.titulo });
        toast.success("Oportunidade criada!");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error("Erro ao salvar oportunidade");
      console.error(error);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Oportunidade" : "Nova Oportunidade"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="titulo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Proposta Empresa XYZ" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="prospect_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prospect</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um prospect" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {prospects?.map((prospect) => (
                        <SelectItem key={prospect.id} value={prospect.id}>
                          {prospect.nome_razao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="etapa_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Etapa do Funil</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a etapa" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {stages?.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="valor_estimado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Valor Estimado: {formatCurrency(field.value || 0)}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="probabilidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Probabilidade: {field.value}%</FormLabel>
                  <FormControl>
                    <Slider
                      value={[field.value || 50]}
                      onValueChange={(v) => field.onChange(v[0])}
                      max={100}
                      step={5}
                      className="mt-2"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="data_prevista_fechamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Previsão de Fechamento</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createDeal.isPending || updateDeal.isPending}
              >
                {createDeal.isPending || updateDeal.isPending
                  ? "Salvando..."
                  : isEditing
                  ? "Salvar"
                  : "Criar Oportunidade"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
