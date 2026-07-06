/**
 * Temporary utility for super admins: generates the exact `curl` command
 * to invoke the `seed-rls-test-users` edge function with the current session's
 * access_token, and copies it to the clipboard.
 *
 * Remove this widget once the RLS smoke test credentials are seeded and
 * stored in the `RLS_TEST_USERS` GitHub secret.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Terminal, Copy, Check, X } from "lucide-react";
import { toast } from "sonner";

const FN_URL =
  "https://oqsnzwkiwgqwopuaugxj.supabase.co/functions/v1/seed-rls-test-users";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xc256d2tpd2dxd29wdWF1Z3hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MzA4MzYsImV4cCI6MjA4NDAwNjgzNn0.cRyFhuniebuAV2nYajedJHMKMD3lnHpl_6-9UHJHPPc";

export function RlsSeedCurlWidget() {
  const [cmd, setCmd] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(true);

  async function generate() {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) {
      toast.error("Sessão não encontrada. Faça login novamente.");
      return;
    }
    const c = `curl -X POST "${FN_URL}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "apikey: ${ANON_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{}'`;
    setCmd(c);
    try {
      await navigator.clipboard.writeText(c);
      setCopied(true);
      toast.success("curl copiado para o clipboard");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.message("curl gerado — copie manualmente do bloco abaixo");
    }
  }

  async function copyAgain() {
    if (!cmd) return;
    await navigator.clipboard.writeText(cmd);
    setCopied(true);
    toast.success("Copiado");
    setTimeout(() => setCopied(false), 2500);
  }

  if (!open) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-card shadow-lg">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Terminal className="h-4 w-4 text-primary" />
          RLS Seed — curl helper
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 p-3">
        <p className="text-xs text-muted-foreground">
          Gera o comando <code>curl</code> para invocar <code>seed-rls-test-users</code>{" "}
          com o token da sua sessão atual. Cole no terminal do Mac.
        </p>

        <div className="flex gap-2">
          <Button size="sm" onClick={generate} className="gap-2">
            <Terminal className="h-3.5 w-3.5" />
            Gerar & copiar
          </Button>
          {cmd && (
            <Button size="sm" variant="outline" onClick={copyAgain} className="gap-2">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado" : "Copiar de novo"}
            </Button>
          )}
        </div>

        {cmd && (
          <pre className="max-h-40 overflow-auto rounded border border-border bg-muted/40 p-2 text-[10px] leading-relaxed text-foreground">
            {cmd}
          </pre>
        )}
      </div>
    </div>
  );
}
