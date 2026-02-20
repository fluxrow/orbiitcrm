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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateProspect, useUpdateProspect } from "@/hooks/useOrbitProspects";
import { usePromoteProspect } from "@/hooks/usePromoteProspect";
import { toast } from "sonner";
import { ArrowUpRight, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

const prospectSchema = z.object({
  nome_razao: z.string().min(2, "Nome é obrigatório") as z.ZodType<string>,
  nome_fantasia: z.string().optional(),
  email_principal: z.string().email("Email inválido").optional().or(z.literal("")),
  telefone_whatsapp: z.string().optional(),
  cnpj_cpf: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  segmento: z.string().optional(),
  origem_lead: z.string().optional(),
  status_qualificacao: z.string().optional(),
  observacoes: z.string().optional(),
  tipo: z.string().optional(),
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

const MATCH_LABELS: Record<string, string> = {
  cnpj: "CNPJ",
  domain: "Domínio",
  name: "Nome",
  new: "Novo cliente",
  manual: "Manual",
};

export function ProspectDialog({ open, onOpenChange, prospect }: ProspectDialogProps) {
  const createProspect = useCreateProspect();
  const updateProspect = useUpdateProspect();
  const promoteProspect = usePromoteProspect();
  const isEditing = !!prospect;

  const [showPromote, setShowPromote] = useState(false);
  const [createOpp, setCreateOpp] = useState(true);
  const [promoteResult, setPromoteResult] = useState<any>(null);

  const form = useForm<ProspectFormData>({
    resolver: zodResolver(prospectSchema),
    defaultValues: {
      nome_razao: "",
      nome_fantasia: "",
      email_principal: "",
      telefone_whatsapp: "",
      cnpj_cpf: "",
      cidade: "",
      estado: "",
      segmento: "",
      origem_lead: "",
      status_qualificacao: "novo",
      observacoes: "",
      tipo: "pessoa",
    },
  });

  useEffect(() => {
    setShowPromote(false);
    setPromoteResult(null);
    if (prospect) {
      form.reset({
        nome_razao: prospect.nome_razao || "",
        nome_fantasia: prospect.nome_fantasia || "",
        email_principal: prospect.email_principal || "",
        telefone_whatsapp: prospect.telefone_whatsapp || "",
        cnpj_cpf: prospect.cnpj_cpf || "",
        cidade: prospect.cidade || "",
        estado: prospect.estado || "",
        segmento: prospect.segmento || "",
        origem_lead: prospect.origem_lead || "",
        status_qualificacao: prospect.status_qualificacao || "novo",
        observacoes: prospect.observacoes || "",
        tipo: prospect.tipo || "pessoa",
      });
    } else {
      form.reset({
        nome_razao: "",
        nome_fantasia: "",
        email_principal: "",
        telefone_whatsapp: "",
        cnpj_cpf: "",
        cidade: "",
        estado: "",
        segmento: "",
        origem_lead: "",
        status_qualificacao: "novo",
        observacoes: "",
        tipo: "pessoa",
      });
    }
  }, [prospect, form]);

  const onSubmit = async (data: ProspectFormData) => {
    try {
      if (isEditing && prospect) {
        await updateProspect.mutateAsync({ id: prospect.id, ...data });
        toast.success("Prospect atualizado com sucesso!");
      } else {
        await createProspect.mutateAsync({ ...data, nome_razao: data.nome_razao });
        toast.success("Prospect criado com sucesso!");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error("Erro ao salvar prospect");
      console.error(error);
    }
  };

  const handlePromote = async () => {
    if (!prospect?.empresa_id) {
      toast.error("Prospect sem empresa vinculada");
      return;
    }
    try {
      const result = await promoteProspect.mutateAsync({
        empresa_id: prospect.empresa_id,
        prospect_id: prospect.id,
        create_opportunity: createOpp,
      });
      setPromoteResult(result);
      toast.success("Prospect promovido para o funil PE!");
    } catch (error: any) {
      const msg = error?.message || "Erro ao promover";
      if (msg.includes("tenant_map_missing")) {
        toast.error("Mapeamento de tenant não configurado. Contate o administrador.");
      } else {
        toast.error(msg);
      }
      console.error(error);
    }
  };

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
                name="telefone_whatsapp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp</FormLabel>
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

            {/* Promote to PE section */}
            {isEditing && !promoteResult && (
              <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
                {!showPromote ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowPromote(true)}
                  >
                    <ArrowUpRight className="h-4 w-4 mr-2" />
                    Promover para Funil (PE)
                  </Button>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Isso criará (ou linkará) um Cliente e Contato no módulo PE com deduplicação inteligente.
                    </p>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="create-opp"
                        checked={createOpp}
                        onCheckedChange={(v) => setCreateOpp(!!v)}
                      />
                      <label htmlFor="create-opp" className="text-sm cursor-pointer">
                        Criar oportunidade automaticamente
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPromote(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handlePromote}
                        disabled={promoteProspect.isPending}
                      >
                        {promoteProspect.isPending ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Promovendo...</>
                        ) : (
                          "Confirmar Promoção"
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Result after promotion */}
            {promoteResult && (
              <div className="border border-primary/30 rounded-lg p-4 bg-primary/10 space-y-2">
                <p className="text-sm font-medium text-primary">✓ Prospect promovido com sucesso!</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Match: <span className="font-medium text-foreground">{MATCH_LABELS[promoteResult.match_type] || promoteResult.match_type}</span> ({promoteResult.match_confidence}%)</p>
                  {promoteResult.oportunidade_id && <p>Oportunidade criada no funil PE</p>}
                </div>
              </div>
            )}

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
