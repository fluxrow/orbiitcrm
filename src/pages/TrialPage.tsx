import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, CheckCircle, Rocket } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  nome: z.string().trim().min(2, "Nome é obrigatório").max(100),
  empresa: z.string().trim().min(2, "Nome da empresa é obrigatório").max(100),
  email: z.string().trim().email("Email inválido").max(255),
  telefone: z.string().trim().max(20).optional().or(z.literal("")),
  plan_code: z.enum(["basic", "professional", "plus"]),
});

type FormValues = z.infer<typeof schema>;

const PLAN_LABELS: Record<string, string> = {
  basic: "Basic",
  professional: "Professional",
  plus: "Plus",
};

export default function TrialPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const defaultPlan = (searchParams.get("plan") || "basic") as FormValues["plan_code"];
  const validPlan = ["basic", "professional", "plus"].includes(defaultPlan) ? defaultPlan : "basic";

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", empresa: "", email: "", telefone: "", plan_code: validPlan },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      const { data: result, error } = await supabase.functions.invoke('auto-approve-trial', {
        body: {
          nome: data.nome,
          empresa: data.empresa,
          email: data.email,
          telefone: data.telefone || null,
          plan_code: data.plan_code,
        },
      });

      if (error) {
        const msg = (result as any)?.error?.message || "Tente novamente em alguns instantes.";
        toast({ title: "Erro ao enviar", description: msg, variant: "destructive" });
        return;
      }

      // Check for API-level error in response body
      if (result && !result.success && result.error) {
        toast({ title: "Erro", description: result.error.message || "Erro ao processar solicitação.", variant: "destructive" });
        return;
      }

      setSubmitted(true);
    } catch (e) {
      toast({ title: "Erro ao enviar", description: "Tente novamente em alguns instantes.", variant: "destructive" });
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="glass-card max-w-md w-full text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Conta criada com sucesso!</CardTitle>
            <CardDescription className="mt-2">
              Enviamos um e-mail de ativação para o endereço informado. Verifique sua caixa de entrada (e spam) e clique no link para criar sua senha e começar a usar o Orbit CRM.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" onClick={() => navigate("/demo")}>
              Explorar o Demo enquanto isso
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate("/")}>
              Voltar para o início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <Card className="glass-card max-w-lg w-full">
        <CardHeader>
          <button onClick={() => navigate("/")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-primary" />
            </div>
            <CardTitle className="text-2xl">Começar Trial 7 dias</CardTitle>
          </div>
          <CardDescription>
            Preencha os dados abaixo. Entraremos em contato para ativar sua conta gratuitamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="nome" render={({ field }) => (
                <FormItem>
                  <FormLabel>Seu nome</FormLabel>
                  <FormControl><Input placeholder="João Silva" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="empresa" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da empresa</FormLabel>
                  <FormControl><Input placeholder="Minha Empresa Ltda" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="joao@empresa.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="telefone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone <span className="text-muted-foreground">(opcional)</span></FormLabel>
                  <FormControl><Input placeholder="(11) 99999-9999" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="plan_code" render={({ field }) => (
                <FormItem>
                  <FormLabel>Plano desejado</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o plano" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(PLAN_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Enviando..." : "Solicitar Trial"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
