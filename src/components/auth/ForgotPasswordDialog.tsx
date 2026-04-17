import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const emailSchema = z.string().trim().min(1, "Informe seu e-mail.").email("Digite um e-mail válido.").max(255);

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBackToLogin?: () => void;
  defaultEmail?: string;
}

export function ForgotPasswordDialog({ open, onOpenChange, onBackToLogin, defaultEmail = "" }: ForgotPasswordDialogProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setEmail(defaultEmail);
      setError(null);
      setStatus("idle");
      // Focus input after dialog opens
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, defaultEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;

    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError(null);
    setStatus("loading");

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        // Surface technical errors (rate limit, etc.) but never reveal account existence
        const msg = resetError.message?.toLowerCase() ?? "";
        if (msg.includes("rate") || msg.includes("limit") || msg.includes("too many")) {
          toast.error("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
          setStatus("idle");
          return;
        }
        // For any other error, still show neutral success to avoid user enumeration
        console.error("resetPasswordForEmail error:", resetError);
      }

      setStatus("success");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível processar a solicitação. Tente novamente.");
      setStatus("idle");
    }
  };

  const handleBackToLogin = () => {
    onOpenChange(false);
    onBackToLogin?.();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (status !== "loading") onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recuperar senha</DialogTitle>
          <DialogDescription>
            {status === "success"
              ? "Verifique sua caixa de entrada."
              : "Informe seu e-mail de acesso para receber as instruções de redefinição de senha."}
          </DialogDescription>
        </DialogHeader>

        {status === "success" ? (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
              <CheckCircle2 className="w-5 h-5 text-success mt-0.5 shrink-0" />
              <p className="text-sm text-foreground">
                Se este e-mail estiver cadastrado, enviaremos um link para redefinição de senha. O link expira em 60 minutos.
              </p>
            </div>
            <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={handleBackToLogin} className="w-full sm:w-auto">
                Voltar para login
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="forgot-email">E-mail</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="forgot-email"
                  ref={inputRef}
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                  className="pl-10"
                  disabled={status === "loading"}
                  aria-invalid={!!error}
                  aria-describedby={error ? "forgot-email-error" : undefined}
                />
              </div>
              {error && (
                <p id="forgot-email-error" className="text-sm text-destructive mt-1">{error}</p>
              )}
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleBackToLogin}
                disabled={status === "loading"}
                className="w-full sm:w-auto"
              >
                Voltar para login
              </Button>
              <Button type="submit" disabled={status === "loading"} className="w-full sm:w-auto">
                {status === "loading" ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                ) : (
                  "Enviar link de recuperação"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
