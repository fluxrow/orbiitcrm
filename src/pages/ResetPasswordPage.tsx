import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/orbit-logo.png";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";

const passwordSchema = z.object({
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").max(72, "Senha muito longa."),
  confirm: z.string().min(1, "Confirme sua nova senha."),
}).refine((d) => d.password === d.confirm, {
  message: "As senhas não coincidem.",
  path: ["confirm"],
});

type Phase = "validating" | "invalid" | "ready" | "saving" | "success";

function translateAuthError(error: unknown): string {
  const err = error as { message?: string; code?: string } | null;
  const raw = `${err?.message ?? ""} ${err?.code ?? ""}`.toLowerCase();

  if (!raw.trim()) return "Não foi possível redefinir sua senha. Tente novamente.";

  if (raw.includes("different from the old password") || raw.includes("same_password")) {
    return "A nova senha deve ser diferente da senha atual.";
  }
  if (raw.includes("at least") && raw.includes("character")) {
    return "A senha deve ter pelo menos 8 caracteres.";
  }
  if (raw.includes("weak_password") || raw.includes("password is too weak") || raw.includes("too weak")) {
    return "Senha muito fraca. Use letras, números e símbolos.";
  }
  if (raw.includes("auth session missing") || raw.includes("session_not_found") || raw.includes("no session")) {
    return "Sessão expirada. Solicite um novo link de recuperação.";
  }
  if (raw.includes("token has expired") || raw.includes("invalid token") || raw.includes("otp_expired") || raw.includes("token is invalid")) {
    return "Link expirado ou inválido. Solicite um novo link.";
  }
  if (raw.includes("rate limit") || raw.includes("over_email_send_rate_limit") || raw.includes("too many requests")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }
  if (raw.includes("invalid email") || raw.includes("email_address_invalid")) {
    return "E-mail inválido.";
  }
  if (raw.includes("user not found") || raw.includes("user_not_found")) {
    return "Usuário não encontrado.";
  }

  return "Não foi possível redefinir sua senha. Tente novamente.";
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("validating");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [showForgot, setShowForgot] = useState(false);

  useEffect(() => {
    document.title = "Redefinir senha — Orbit CRM";
    return () => { document.title = "Orbit CRM — CRM com IA para WhatsApp, Email e Vendas"; };
  }, []);

  useEffect(() => {
    let resolved = false;

    // Listen for PASSWORD_RECOVERY event (Supabase fires this when arriving via recovery link)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        resolved = true;
        setPhase("ready");
      }
    });

    // Also check if a session is already present (token already exchanged)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        resolved = true;
        setPhase("ready");
      }
    });

    // If no recovery session arrives within 2.5s, treat link as invalid
    const timer = setTimeout(() => {
      if (!resolved) setPhase("invalid");
    }, 2500);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phase === "saving") return;

    const parsed = passwordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      const fieldErrors: { password?: string; confirm?: string } = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as "password" | "confirm";
        if (!fieldErrors[k]) fieldErrors[k] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setPhase("saving");

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      toast.error(error.message || "Não foi possível redefinir sua senha.");
      setPhase("ready");
      return;
    }

    setPhase("success");
    toast.success("Senha redefinida com sucesso!");
    await supabase.auth.signOut();
    setTimeout(() => navigate("/auth", { replace: true }), 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="glass-card p-8">
          <div className="flex justify-center mb-8">
            <img src={logo} alt="Orbit CRM" className="h-28 w-auto" />
          </div>

          {phase === "validating" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Validando link de recuperação...</p>
            </div>
          )}

          {phase === "invalid" && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full bg-destructive/15 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-destructive" />
                </div>
              </div>
              <h1 className="text-xl font-semibold">Link inválido ou expirado</h1>
              <p className="text-sm text-muted-foreground">
                Este link de recuperação é inválido ou expirou. Solicite um novo link para redefinir sua senha.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <Button onClick={() => setShowForgot(true)} className="w-full">
                  Solicitar novo link
                </Button>
                <Button variant="ghost" onClick={() => navigate("/auth")} className="w-full">
                  Voltar para login
                </Button>
              </div>
            </div>
          )}

          {phase === "success" && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-success" />
                </div>
              </div>
              <h1 className="text-xl font-semibold">Senha redefinida</h1>
              <p className="text-sm text-muted-foreground">
                Senha redefinida com sucesso. Redirecionando para o login...
              </p>
            </div>
          )}

          {(phase === "ready" || phase === "saving") && (
            <>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-semibold">Redefinir senha</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Escolha uma nova senha para sua conta.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="new-password">Nova senha</Label>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((p) => ({ ...p, password: undefined })); }}
                      className="pl-10"
                      disabled={phase === "saving"}
                      autoComplete="new-password"
                      required
                      minLength={8}
                    />
                  </div>
                  {errors.password && <p className="text-sm text-destructive mt-1">{errors.password}</p>}
                </div>

                <div>
                  <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined })); }}
                      className="pl-10"
                      disabled={phase === "saving"}
                      autoComplete="new-password"
                      required
                      minLength={8}
                    />
                  </div>
                  {errors.confirm && <p className="text-sm text-destructive mt-1">{errors.confirm}</p>}
                </div>

                <Button type="submit" className="w-full" disabled={phase === "saving"}>
                  {phase === "saving" ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
                  ) : (
                    "Salvar nova senha"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      <ForgotPasswordDialog
        open={showForgot}
        onOpenChange={setShowForgot}
        onBackToLogin={() => navigate("/auth")}
      />
    </div>
  );
}
