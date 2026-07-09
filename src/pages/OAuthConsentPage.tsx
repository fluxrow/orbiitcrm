import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import logo from "@/assets/orbit-logo.png";

type AuthorizationDetails = {
  client?: { name?: string; client_uri?: string; redirect_uris?: string[] } | null;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};

// Typed local wrapper for the beta supabase.auth.oauth namespace.
type OAuthApi = {
  getAuthorizationDetails: (
    id: string
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string
  ) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string
  ) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
};

const oauthApi = (): OAuthApi => (supabase.auth as any).oauth as OAuthApi;

export default function OAuthConsentPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const authorizationId = params.get("authorization_id") ?? "";

  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Autorizar acesso — Orbit CRM";
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!authorizationId) {
      setError("authorization_id ausente na URL.");
      setLoading(false);
      return;
    }
    if (!user) {
      const next = window.location.pathname + window.location.search;
      navigate(`/auth?next=${encodeURIComponent(next)}`, { replace: true });
      return;
    }
    let active = true;
    (async () => {
      const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [authLoading, user, authorizationId, navigate]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauthApi().approveAuthorization(authorizationId)
      : await oauthApi().denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor OAuth não retornou uma URL de redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md glass-card p-8 space-y-4">
          <h1 className="text-xl font-semibold">Não foi possível carregar esta autorização</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const scopes = (details?.scope ?? "openid email profile").split(/\s+/).filter(Boolean);
  const clientName = details?.client?.name ?? "Aplicativo externo";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md glass-card p-8 space-y-6">
        <div className="flex justify-center">
          <img src={logo} alt="Orbit CRM" className="h-16 w-auto" />
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold">Conectar {clientName} à sua conta</h1>
          <p className="text-sm text-muted-foreground">
            {clientName} poderá chamar as ferramentas do Orbit CRM em seu nome enquanto você
            estiver conectado. As permissões da sua empresa e as políticas de dados do Orbit
            continuam sendo aplicadas.
          </p>
        </div>

        <div className="rounded-lg border border-border/60 p-4 space-y-2">
          <div className="text-xs uppercase text-muted-foreground tracking-wide">
            Conta conectada
          </div>
          <div className="text-sm">{user?.email}</div>
        </div>

        <div className="rounded-lg border border-border/60 p-4 space-y-2">
          <div className="text-xs uppercase text-muted-foreground tracking-wide">
            Permissões solicitadas
          </div>
          <ul className="text-sm space-y-1">
            {scopes.map((s) => (
              <li key={s} className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>
                  {s === "openid" && "Verificar sua identidade"}
                  {s === "email" && "Compartilhar seu endereço de e-mail"}
                  {s === "profile" && "Compartilhar seu perfil básico"}
                  {!["openid", "email", "profile"].includes(s) && `Permissão adicional: ${s}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground pt-2">
            Isto não substitui as permissões da sua empresa nem as políticas do backend do Orbit.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => decide(false)}
          >
            Cancelar
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            {busy ? "Autorizando…" : "Autorizar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
