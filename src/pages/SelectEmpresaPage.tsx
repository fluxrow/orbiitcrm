import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Building2, LogOut, Check } from "lucide-react";
import { toast } from "sonner";

type EmpresaRow = {
  empresa_id: string;
  nome: string;
  slug: string | null;
  role: string;
  is_active: boolean;
};

export default function SelectEmpresaPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();

  const { data: empresas, isLoading } = useQuery({
    queryKey: ["my-empresas", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_empresas" as any);
      if (error) throw error;
      return (data || []) as EmpresaRow[];
    },
  });

  const selectMutation = useMutation({
    mutationFn: async (empresaId: string) => {
      const { error } = await supabase.rpc("set_active_empresa" as any, { p_empresa_id: empresaId });
      if (error) throw error;
    },
  });

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [user, authLoading, navigate]);

  // Auto-advance when only one empresa
  useEffect(() => {
    if (!empresas || isLoading) return;
    if (empresas.length === 1) {
      const e = empresas[0];
      if (e.slug) navigate(`/${e.slug}/dashboard`, { replace: true });
      else navigate("/demo/dashboard", { replace: true });
    }
  }, [empresas, isLoading, navigate]);

  const handleSelect = async (e: EmpresaRow) => {
    try {
      await selectMutation.mutateAsync(e.empresa_id);
      if (e.slug) navigate(`/${e.slug}/dashboard`, { replace: true });
      else navigate("/demo/dashboard", { replace: true });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao selecionar empresa");
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!empresas || empresas.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">Nenhuma empresa vinculada</h1>
          <p className="text-sm text-muted-foreground">
            Sua conta ainda não está vinculada a nenhuma empresa. Solicite acesso ao administrador ou faça uma nova solicitação de trial.
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <Button variant="outline" onClick={() => signOut().then(() => navigate("/auth"))}>
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
            <Button onClick={() => navigate("/trial")}>Solicitar trial</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Escolha a empresa</h1>
          <p className="text-sm text-muted-foreground">
            Você tem acesso a {empresas.length} empresas. Selecione qual deseja acessar agora.
          </p>
        </div>

        <div className="grid gap-3">
          {empresas.map((e) => (
            <Card
              key={e.empresa_id}
              className={cn(
                "p-4 flex items-center gap-4 cursor-pointer transition-colors",
                e.is_active
                  ? "border-2 border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "hover:border-primary"
              )}
              onClick={() => !selectMutation.isPending && handleSelect(e)}
            >
              <div className={cn(
                "h-12 w-12 rounded-lg flex items-center justify-center shrink-0",
                e.is_active ? "bg-primary text-primary-foreground" : "bg-primary/10"
              )}>
                <Building2 className={cn("h-6 w-6", e.is_active ? "" : "text-primary")} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold truncate">{e.nome}</h3>
                  {e.is_active && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary text-primary-foreground flex items-center gap-1">
                      <Check className="h-3 w-3" /> Empresa atual
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {e.slug ? `/${e.slug}` : "sem slug"} · {e.role}
                </p>
              </div>
              <Button size="sm" variant={e.is_active ? "secondary" : "default"} disabled={selectMutation.isPending}>
                {selectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : e.is_active ? "Continuar" : "Entrar"}
              </Button>
            </Card>
          ))}
        </div>

        <div className="flex justify-center pt-4">
          <Button variant="ghost" size="sm" onClick={() => signOut().then(() => navigate("/auth"))}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
