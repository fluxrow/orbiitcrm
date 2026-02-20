import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateEmpresa } from "@/hooks/useSuperAdmin";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Building2, User } from "lucide-react";

const empresaSchema = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  cnpj: z.string().optional(),
  email_contato: z.string().email("Email inválido").optional().or(z.literal("")),
  telefone: z.string().optional(),
  plano_saas: z.string().default("demo"),
  max_usuarios: z.coerce.number().min(1).default(5),
  admin_nome: z.string().min(2, "Nome do admin obrigatório"),
  admin_email: z.string().email("Email do admin inválido"),
  admin_senha: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
}).refine((data) => {
  if (data.plano_saas !== "demo") {
    return !!data.cnpj && data.cnpj.replace(/\D/g, "").length === 14;
  }
  return true;
}, {
  message: "CNPJ obrigatório (14 dígitos) para planos não-demo",
  path: ["cnpj"],
});

type EmpresaFormData = z.infer<typeof empresaSchema>;

interface EmpresaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EmpresaDialog({ open, onOpenChange }: EmpresaDialogProps) {
  const createEmpresa = useCreateEmpresa();

  const form = useForm<EmpresaFormData>({
    resolver: zodResolver(empresaSchema),
    defaultValues: {
      nome: "",
      cnpj: "",
      email_contato: "",
      telefone: "",
      plano_saas: "demo",
      max_usuarios: 5,
      admin_nome: "",
      admin_email: "",
      admin_senha: "",
    },
  });

  const onSubmit = async (data: EmpresaFormData) => {
    try {
      await createEmpresa.mutateAsync({
        nome: data.nome,
        cnpj: data.cnpj,
        email_contato: data.email_contato,
        telefone: data.telefone,
        plano_saas: data.plano_saas,
        max_usuarios: data.max_usuarios,
        admin_nome: data.admin_nome,
        admin_email: data.admin_email,
        admin_senha: data.admin_senha,
      });
      toast.success("Empresa criada com sucesso!");
      form.reset();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar empresa");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Empresa</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Dados da Empresa */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Building2 className="w-4 h-4" />
                Dados da Empresa
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da Empresa *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome da empresa" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cnpj"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CNPJ</FormLabel>
                      <FormControl>
                        <Input placeholder="00.000.000/0000-00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email_contato"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email de Contato</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="contato@empresa.com"
                          {...field}
                        />
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
                        <Input placeholder="(00) 00000-0000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="plano_saas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plano SaaS</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o plano" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="demo">Demo</SelectItem>
                          <SelectItem value="basic">Basic</SelectItem>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="plus">Plus</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="max_usuarios"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Máximo de Usuários</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Dados do Admin Inicial */}
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <User className="w-4 h-4" />
                Usuário Admin Inicial
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="admin_nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Admin *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome completo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="admin_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email do Admin *</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="admin@empresa.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="admin_senha"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Senha Inicial *</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Mínimo 6 caracteres"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createEmpresa.isPending}>
                {createEmpresa.isPending ? "Criando..." : "Criar Empresa"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
