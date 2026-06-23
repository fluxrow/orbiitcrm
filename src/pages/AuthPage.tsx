import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, User } from "lucide-react";
import logo from "@/assets/orbit-logo.png";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";

export default function AuthPage() {
  const navigate = useNavigate();
  const { user, loading, signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    document.title = "Login — Orbit CRM | Acesse sua conta";
    return () => { document.title = "Orbit CRM — CRM com IA para WhatsApp, Email e Vendas"; };
  }, []);

  useEffect(() => {
    checkIfSetupNeeded();
  }, []);

  // Post-login redirect: resolve slug or demo
  useEffect(() => {
    if (!user || redirecting) return;
    setRedirecting(true);
    resolveRedirect();
  }, [user]);

  async function resolveRedirect() {
    try {
      // 1. Check if super_admin → redirect to /pe-admin
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "super_admin")
        .limit(1);

      if (roles && roles.length > 0) {
        navigate("/pe-admin", { replace: true });
        return;
      }

      // 1b. If user belongs to multiple empresas, show picker
      const { data: memberships } = await supabase.rpc("get_my_empresas" as any);
      const membershipList = (memberships as any[]) || [];
      if (membershipList.length > 1) {
        navigate("/select-empresa", { replace: true });
        return;
      }



      // 2. Check empresa_id → redirect to /{slug}/dashboard
      const { data: profile } = await supabase
        .from("profiles")
        .select("empresa_id")
        .eq("id", user!.id)
        .maybeSingle();

      let empresaId = profile?.empresa_id;

      // 2b. If no empresa_id on profile, try resolving via pe_users → tenant_map
      if (!empresaId) {
        const { data: peUser } = await supabase
          .from("pe_users" as any)
          .select("organization_id")
          .eq("id", user!.id)
          .maybeSingle();

        if ((peUser as any)?.organization_id) {
          const { data: tenantMap } = await supabase
            .from("pe_tenant_map" as any)
            .select("empresa_id")
            .eq("organization_id", (peUser as any).organization_id)
            .maybeSingle();

          if ((tenantMap as any)?.empresa_id) {
            empresaId = (tenantMap as any).empresa_id;
            // Also fix profile for future logins
            await supabase.from("profiles")
              .update({ empresa_id: empresaId } as any)
              .eq("id", user!.id);
          }
        }
      }

      if (!empresaId) {
        navigate("/demo/dashboard", { replace: true });
        return;
      }

      const { data: empresa } = await supabase
        .from("orbit_empresas")
        .select("slug")
        .eq("id", empresaId)
        .maybeSingle();

      if (empresa?.slug) {
        navigate(`/${empresa.slug}/dashboard`, { replace: true });
      } else {
        navigate("/demo/dashboard", { replace: true });
      }
    } catch {
      navigate("/demo/dashboard", { replace: true });
    }
  }

  const checkIfSetupNeeded = async () => {
    try {
      const { data, error } = await supabase.rpc("super_admin_exists");

      if (error) {
        console.error("Error checking super admin:", error);
        setCheckingSetup(false);
        return;
      }

      if (data !== true) {
        navigate("/setup", { replace: true });
        return;
      }

      setCheckingSetup(false);
    } catch (err) {
      console.error("Error:", err);
      setCheckingSetup(false);
    }
  };


  if (loading || checkingSetup || redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (user) {
    // Will be handled by the useEffect above
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Login realizado com sucesso!");
        }
      } else {
        const { error } = await signUp(email, password, nome);
        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Conta criada com sucesso!");
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="glass-card p-8">
          <div className="flex justify-center mb-8">
            <img src={logo} alt="Orbit CRM" className="h-28 w-auto" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <Label htmlFor="nome">Nome</Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="nome"
                    type="text"
                    placeholder="Seu nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Aguarde..." : isLogin ? "Entrar" : "Criar Conta"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Faça login"}
            </button>
          </div>
        </div>
      </div>

      <ForgotPasswordDialog
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        defaultEmail={email}
      />
    </div>
  );
}
