import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaVendedores } from "@/hooks/useEmpresaVendedores";
import { useTenant } from "@/contexts/TenantContext";

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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateProspect, useUpdateProspect } from "@/hooks/useOrbitProspects";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

const prospectSchema = z.object({
  nome_razao: z.string().min(2, "Nome é obrigatório") as z.ZodType<string>,
  nome_fantasia: z.string().optional(),
  nome_contato: z.string().optional(),
  email_principal: z.string().email("Email inválido").optional().or(z.literal("")),
  telefone: z.string().optional(),
  whatsapp: z.string().optional(),
  cnpj_cpf: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  segmento: z.string().optional(),
  origem_lead: z.string().optional(),
  status_qualificacao: z.string().optional(),
  observacoes: z.string().optional(),
  tipo: z.string().optional(),
  responsavel_id: z.string().optional().or(z.literal("")),
});

type ProspectFormData = z.infer<typeof prospectSchema>;

interface ProspectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect?: Tables<"orbit_prospects"> | null;
}

const STATUS_OPTIONS = [
  { value: "novo", label: "Novo" },
  { value: "em_qualificacao", label: "Em Qualificação" },
  { value: "qualificado", label: "Qualificado" },
  { value: "desqualificado", label: "Desqualificado" },
];

const ESTADOS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

const whatsappStatusLabel: Record<string, { label: string; className: string }> = {
  nao_verificado: { label: "Não verificado", className: "bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))]" },
  valido: { label: "Válido", className: "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]" },
  invalido: { label: "Inválido", className: "bg-destructive/20 text-destructive" },
};

export function ProspectDialog({ open, onOpenChange, prospect }: ProspectDialogProps) {
  const createProspect = useCreateProspect();
  const updateProspect = useUpdateProspect();
  const { data: vendedores } = useEmpresaVendedores();
  const isEditing = !!prospect;

  // CRITICAL: empresa from URL tenant — not from profiles.empresa_id.
  const { empresaId: tenantEmpresaId } = useTenant();
  const myProfile = tenantEmpresaId ? { empresa_id: tenantEmpresaId } : null;

  const form = useForm<ProspectFormData>({
    resolver: zodResolver(prospectSchema),
    defaultValues: {
      nome_razao: "",
      nome_fantasia: "",
      nome_contato: "",
      email_principal: "",
      telefone: "",
      whatsapp: "",
      cnpj_cpf: "",
      cidade: "",
      estado: "",
      segmento: "",
      origem_lead: "",
      status_qualificacao: "novo",
      observacoes: "",
      tipo: "pessoa",
      responsavel_id: "",
    },
  });

  useEffect(() => {
    if (prospect) {
      form.reset({
        nome_razao: prospect.nome_razao || "",
        nome_fantasia: prospect.nome_fantasia || "",
        nome_contato: (prospect as any).nome_contato || "",
        email_principal: prospect.email_principal || "",
        telefone: prospect.telefone || "",
        whatsapp: prospect.whatsapp || "",
        cnpj_cpf: prospect.cnpj_cpf || "",
        cidade: prospect.cidade || "",
        estado: prospect.estado || "",
        segmento: prospect.segmento || "",
        origem_lead: prospect.origem_lead || "",
        status_qualificacao: prospect.status_qualificacao || "novo",
        observacoes: prospect.observacoes || "",
        tipo: prospect.tipo || "pessoa",
        responsavel_id: prospect.responsavel_id || "",
      });
    } else {
      form.reset({
        nome_razao: "",
        nome_fantasia: "",
        nome_contato: "",
        email_principal: "",
        telefone: "",
        whatsapp: "",
        cnpj_cpf: "",
        cidade: "",
        estado: "",
        segmento: "",
        origem_lead: "",
        status_qualificacao: "novo",
        observacoes: "",
        tipo: "pessoa",
        responsavel_id: "",
      });
    }
  }, [prospect, form]);

  const onSubmit = async (data: ProspectFormData) => {
    try {
      const submitData = {
        ...data,
        responsavel_id: data.responsavel_id || null,
      };
      if (isEditing && prospect) {
        await updateProspect.mutateAsync({ id: prospect.id, ...submitData });
        toast.success("Prospect atualizado com sucesso!");
      } else {
        await createProspect.mutateAsync({ ...submitData, nome_razao: data.nome_razao, empresa_id: myProfile?.empresa_id });
        toast.success("Prospect criado com sucesso!");
      }
      onOpenChange(false);
    } catch (error: any) {
      const msg = error?.message || error?.error_description || error?.hint || "Erro ao salvar prospect";
      toast.error(`Erro ao salvar prospect: ${msg}`);
      console.error("[ProspectDialog] save error", error);
    }
  };

  const currentWhatsappStatus = prospect?.whatsapp_status || "nao_verificado";
  const wsStatus = whatsappStatusLabel[currentWhatsappStatus] || whatsappStatusLabel.nao_verificado;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Prospect" : "Novo Prospect"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pessoa">Pessoa Física</SelectItem>
                        <SelectItem value="empresa">Empresa</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status_qualificacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="nome_razao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome / Razão Social *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome completo ou razão social" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nome_fantasia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Fantasia</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome fantasia (opcional)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nome_contato"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contato (pessoa)</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome da pessoa de contato" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email_principal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@exemplo.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="telefone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input placeholder="(11) 3456-7890" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-1">
              <FormField
                control={form.control}
                name="whatsapp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      WhatsApp
                      {isEditing && prospect?.whatsapp && (
                        <Badge className={`text-[10px] ${wsStatus.className}`}>{wsStatus.label}</Badge>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="5511999999999" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="cnpj_cpf"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CPF/CNPJ</FormLabel>
                  <FormControl>
                    <Input placeholder="Documento" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input placeholder="Cidade" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="estado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ESTADOS.map((uf) => (
                          <SelectItem key={uf} value={uf}>
                            {uf}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="segmento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Segmento</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Tecnologia, Varejo..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="origem_lead"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origem do Lead</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Site, Indicação..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="responsavel_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsável Comercial</FormLabel>
                  <Select onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)} value={field.value || "__none__"}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um responsável" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Sem responsável</SelectItem>
                      {vendedores?.map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.nome} {v.cargo ? `(${v.cargo})` : ""}
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
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Anotações sobre o prospect..."
                      className="min-h-[100px]"
                      {...field}
                    />
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
                disabled={createProspect.isPending || updateProspect.isPending}
              >
                {createProspect.isPending || updateProspect.isPending
                  ? "Salvando..."
                  : isEditing
                  ? "Salvar Alterações"
                  : "Criar Prospect"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}