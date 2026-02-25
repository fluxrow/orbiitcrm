import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Rocket, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface InvitationData {
  id: string;
  email: string;
  status: string;
  expires_at: string;
  organizations: { name: string };
  pe_roles: { name: string; code: string };
}

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    fetchInvitation();
  }, [token]);

  const fetchInvitation = async () => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-invitation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ token, preview: true }),
        }
      );

      const result = await res.json();

      if (!res.ok || !result.ok) {
        const errCode = result.error?.code;
        if (errCode === "INVITE_USED") {
          setError("Este convite já foi utilizado");
        } else if (errCode === "INVITE_EXPIRED") {
          setError("Este convite expirou");
        } else {
          setError("Convite não encontrado ou inválido");
        }
        setLoading(false);
        return;
      }

      const inv = result.data;
      setInvitation({
        id: "",
        email: inv.email,
        status: inv.status,
        expires_at: inv.expires_at,
        organizations: { name: inv.organization_name },
        pe_roles: { name: inv.role_name, code: inv.role_code },
      });
      setLoading(false);
    } catch {
      setError("Erro ao carregar convite");
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-invitation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ token, password: password || undefined, full_name: fullName || undefined }),
        }
      );

      const data = await res.json();

      if (!res.ok || data.error) {
        toast.error(data.error || "Erro ao aceitar convite");
        setSubmitting(false);
        return;
      }

      setAccepted(true);
      toast.success("Convite aceito com sucesso!");
    } catch {
      toast.error("Erro ao aceitar convite");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <CheckCircle className="w-16 h-16 text-primary mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Convite Aceito!</h1>
          <p className="text-muted-foreground">Você já pode fazer login no sistema.</p>
          <Button onClick={() => navigate("/auth")}>Ir para Login</Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <XCircle className="w-16 h-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Convite Inválido</h1>
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => navigate("/auth")}>Ir para Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-lg p-8 space-y-6">
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Rocket className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Aceitar Convite</h1>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Organização</span>
              <span className="text-sm font-medium text-foreground">{invitation?.organizations?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Papel</span>
              <Badge variant="outline">{invitation?.pe_roles?.name}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm text-foreground">{invitation?.email}</span>
            </div>
          </div>

          {!user && (
            <div className="space-y-4">
              <div>
                <Label>Nome completo</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" />
              </div>
              <div>
                <Label>Senha * <span className="text-xs text-muted-foreground font-normal">(mínimo 6 caracteres)</span></Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Crie uma senha" minLength={6} />
              </div>
              <div>
                <Label>Confirmar Senha *</Label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repita a senha" />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-sm text-destructive mt-1">As senhas não coincidem</p>
                )}
              </div>
            </div>
          )}

          <Button className="w-full" onClick={handleAccept} disabled={submitting || (!user && (password.length < 6 || password !== confirmPassword))}>
            {submitting ? "Processando..." : "Aceitar Convite"}
          </Button>
        </div>
      </div>
    </div>
  );
}
