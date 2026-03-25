import { useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsSuperAdmin } from "@/hooks/useUserRole";
import { TenantProvider, useTenant } from "@/contexts/TenantContext";
import TenantNotFound from "./TenantNotFound";
import TenantBlocked from "./TenantBlocked";
import orbitLogo from "@/assets/orbit-logo.png";
import HotsiteHeader from "@/components/HotsiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function DemoAuthGate() {
  const { signIn, signUp } = useAuth();
  const [tab, setTab] = useState<string>("login");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, senha);
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signUp(email, senha, nome);
    if (error) {
      setError(error.message);
    } else {
      setSuccess("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
    }
    setLoading(false);
  };

  return (
    <>
      <HotsiteHeader />
      <div className="min-h-screen flex items-center justify-center bg-background px-4 pt-16">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center space-y-4">
          <img src={orbitLogo} alt="Orbit" className="h-16" />
          <CardTitle className="text-xl">Acesse o Orbit CRM</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">Entrar</TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">Criar Conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">E-mail</Label>
                  <Input id="login-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-senha">Senha</Label>
                  <Input id="login-senha" type="password" required value={senha} onChange={e => setSenha(e.target.value)} />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              {success ? (
                <p className="text-sm text-muted-foreground mt-4 text-center">{success}</p>
              ) : (
                <form onSubmit={handleSignup} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-nome">Nome</Label>
                    <Input id="signup-nome" required value={nome} onChange={e => setNome(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">E-mail</Label>
                    <Input id="signup-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-senha">Senha</Label>
                    <Input id="signup-senha" type="password" required value={senha} onChange={e => setSenha(e.target.value)} />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Criando conta..." : "Criar Conta"}
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      </div>
    </>
  );
}

function TenantContent() {
  const { user, loading: authLoading } = useAuth();
  const { hasRole: isSuperAdmin, isLoading: roleLoading } = useIsSuperAdmin();
  const tenant = useTenant();

  // While auth is loading, show spinner
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // If not logged in and demo mode, show inline auth
  if (!user && tenant.isDemo) {
    return <DemoAuthGate />;
  }

  // If not logged in and not demo, redirect to auth
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // User is logged in, wait for tenant + role to load
  if (tenant.isLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Super admin should go to /pe-admin, not demo
  if (isSuperAdmin && tenant.isDemo) {
    return <Navigate to="/pe-admin" replace />;
  }

  if (tenant.notFound) {
    return <TenantNotFound />;
  }

  if (tenant.isBlocked) {
    return (
      <TenantBlocked
        reason={tenant.blockReason}
        trialEndsAt={tenant.trialEndsAt}
        empresaNome={tenant.empresaNome}
        empresaId={tenant.empresaId}
        basePath={tenant.basePath}
      />
    );
  }

  return <Outlet />;
}

export default function TenantLayout({ isDemo = false }: { isDemo?: boolean }) {
  return (
    <TenantProvider isDemo={isDemo}>
      <TenantContent />
    </TenantProvider>
  );
}
