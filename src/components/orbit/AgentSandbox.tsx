import { useState, useRef, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Webhook, Trash2, Loader2, ShieldCheck, User, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AGENT_SANDBOX_SCENARIOS,
  countApprovedAgentSandboxScenarios,
  type AgentSandboxScenarioKey,
} from "@/lib/agent-sandbox-review";
import { useAgentSandboxReview, useSaveAgentSandboxReview } from "@/hooks/useAgentSandboxReview";

interface AgentSandboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresaId: string | null | undefined;
  tenantSlug?: string | null;
}

interface SandboxMsg {
  id: string;
  role: "assistant" | "user";
  content: string;
  ts: number;
}

interface SandboxFunctionError {
  error?: string;
  code?: string;
  retryable?: boolean;
  retry_after_seconds?: number;
}

async function readSandboxFunctionError(error: unknown): Promise<SandboxFunctionError | null> {
  const context = (error as { context?: Response } | null)?.context;
  if (!context || typeof context.clone !== "function") return null;
  try {
    return (await context.clone().json()) as SandboxFunctionError;
  } catch {
    return null;
  }
}

const MOCK_LEAD = {
  nome: "Mariana",
  origem: "Formulário de captação",
  telefone: "+55 11 90000-0000",
  email: "cliente.teste@exemplo.com",
  cidade: "",
  segmento: "",
  observacoes: "Respondeu ao formulário de captação e deixou os dados de contato.",
};

export function AgentSandbox({ open, onOpenChange, empresaId, tenantSlug }: AgentSandboxProps) {
  const [messages, setMessages] = useState<SandboxMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [scenarioKey, setScenarioKey] = useState<AgentSandboxScenarioKey>("initial_approach");
  const [reviewStatus, setReviewStatus] = useState<"approved" | "rejected" | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const reviewQuery = useAgentSandboxReview(open ? tenantSlug : null);
  const saveReview = useSaveAgentSandboxReview(tenantSlug);
  const reviewState = reviewQuery.data;
  const selectedScenario = AGENT_SANDBOX_SCENARIOS.find((scenario) => scenario.key === scenarioKey)!;
  const approvedCount = countApprovedAgentSandboxScenarios(reviewState?.reviews ?? []);
  const selectedReview = reviewState?.reviews.find((review) => review.scenario_key === scenarioKey);

  // Auto scroll
  useEffect(() => {
    const el = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  const callSandbox = useCallback(
    async (history: SandboxMsg[], trigger?: "inbound_webhook" | "manual") => {
      if (!empresaId) {
        toast.error("Empresa não identificada.");
        return;
      }
      setLoading(true);
      setTyping(true);
      try {
        const { data, error } = await supabase.functions.invoke("orbit-ai-sandbox", {
          body: {
            empresaId,
            mockLead: trigger === "inbound_webhook" ? MOCK_LEAD : null,
            trigger: trigger ?? "manual",
            messages: history.map((m) => ({ role: m.role, content: m.content })),
          },
        });
        if (error) {
          const detail = await readSandboxFunctionError(error);
          if (detail?.code === "AI_PROVIDER_RATE_LIMIT") {
            const wait = Math.max(1, Math.ceil(detail.retry_after_seconds ?? 30));
            throw new Error(`A IA atingiu o limite temporário. Tente novamente em ${wait} segundos.`);
          }
          if (detail?.code === "AI_PROVIDER_CREDITS_EXHAUSTED") {
            throw new Error("O saldo da IA está indisponível. Avise o administrador da plataforma.");
          }
          throw new Error(detail?.error || error.message || "Falha ao chamar a IA");
        }
        if (!data?.ok) throw new Error(data?.error || "Falha ao chamar a IA");
        const reply: string = data.data?.message || "(sem resposta)";
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: reply, ts: Date.now() },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        toast.error(msg);
      } finally {
        setLoading(false);
        setTyping(false);
      }
    },
    [empresaId],
  );

  const handleTriggerWebhook = () => {
    if (loading) return;
    // Sem mensagens novas — gatilho dispara outreach inicial
    void callSandbox([], "inbound_webhook");
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: SandboxMsg = { id: crypto.randomUUID(), role: "user", content: text, ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    void callSandbox(next, "manual");
  };

  const handleClear = () => {
    setMessages([]);
    setInput("");
    toast.success("Histórico limpo");
  };

  const selectScenario = (key: AgentSandboxScenarioKey) => {
    const scenario = AGENT_SANDBOX_SCENARIOS.find((item) => item.key === key)!;
    setScenarioKey(key);
    setMessages([]);
    setInput(scenario.starter ?? "");
  };

  const openReview = (status: "approved" | "rejected") => {
    setReviewStatus(status);
    setReviewComment(selectedReview?.comment ?? "");
  };

  const submitReview = () => {
    if (!reviewStatus) return;
    if (reviewStatus === "rejected" && !reviewComment.trim()) {
      toast.error("Explique o que precisa ser ajustado.");
      return;
    }
    saveReview.mutate(
      { scenarioKey, status: reviewStatus, comment: reviewComment },
      {
        onSuccess: () => {
          toast.success(reviewStatus === "approved" ? "Cenário aprovado" : "Ajuste registrado");
          setReviewStatus(null);
          setReviewComment("");
        },
        onError: (error: any) => toast.error(error?.message || "Não foi possível salvar a avaliação"),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col bg-background/80 backdrop-blur-xl border-l"
      >
        <SheetHeader className="p-4 border-b space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base">Agent Simulator</SheetTitle>
              <SheetDescription className="text-xs">
                Teste o agente em tempo real
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClear}
              disabled={messages.length === 0 || loading}
              title="Limpar histórico"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Badge variant="secondary" className="w-fit gap-1 text-[10px]">
            <ShieldCheck className="h-3 w-3" />
            Ambiente de Teste Seguro · sem persistência
          </Badge>
          {reviewState?.enabled && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Homologação do cliente</span>
                <span className="font-medium">{approvedCount}/{AGENT_SANDBOX_SCENARIOS.length} aprovados</span>
              </div>
              <Progress value={(approvedCount / AGENT_SANDBOX_SCENARIOS.length) * 100} className="h-1.5" />
            </div>
          )}
        </SheetHeader>

        {reviewState?.enabled && (
          <div className="border-b px-4 py-3 space-y-2 bg-muted/20">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {AGENT_SANDBOX_SCENARIOS.map((scenario) => {
                const review = reviewState.reviews.find((item) => item.scenario_key === scenario.key);
                return (
                  <Button
                    key={scenario.key}
                    type="button"
                    size="sm"
                    variant={scenario.key === scenarioKey ? "default" : "outline"}
                    className="h-7 shrink-0 text-[11px] gap-1"
                    onClick={() => selectScenario(scenario.key)}
                  >
                    {review?.status === "approved" && <CheckCircle2 className="h-3 w-3" />}
                    {review?.status === "rejected" && <XCircle className="h-3 w-3" />}
                    {scenario.title}
                  </Button>
                );
              })}
            </div>
            <div className="text-xs">
              <p className="font-medium">{selectedScenario.goal}</p>
              <p className="text-muted-foreground mt-0.5">{selectedScenario.instruction}</p>
            </div>
          </div>
        )}

        {/* Chat area */}
        <ScrollArea ref={scrollRef} className="flex-1 px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center gap-4 py-10">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Webhook className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Inicie um teste de fluxo</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Simule a entrada de um lead via formulário/webhook para que a IA gere a abordagem inicial,
                  ou envie uma mensagem manual abaixo.
                </p>
              </div>
              <Button onClick={handleTriggerWebhook} disabled={loading} className="gap-2">
                <Webhook className="h-4 w-4" />
                Simular Entrada de Lead (Webhook)
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}
                >
                  {m.role === "assistant" && (
                    <div className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-secondary text-foreground rounded-bl-md",
                    )}
                  >
                    {m.content}
                  </div>
                  {m.role === "user" && (
                    <div className="h-7 w-7 rounded-full bg-secondary text-foreground flex items-center justify-center shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
              {typing && (
                <div className="flex gap-2 justify-start">
                  <div className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="bg-secondary rounded-2xl rounded-bl-md px-3.5 py-2.5 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Footer / Composer */}
        <div className="border-t p-3 space-y-2 bg-background/60">
          {reviewState?.enabled && messages.length > 0 && (
            <div className="rounded-md border p-2 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                A conversa não será salva. Registre apenas sua decisão sobre este cenário.
              </p>
              {reviewState.can_review ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" size="sm" variant="outline" className="gap-1 text-xs" onClick={() => openReview("rejected")}>
                    <XCircle className="h-3.5 w-3.5" /> Precisa de ajuste
                  </Button>
                  <Button type="button" size="sm" className="gap-1 text-xs" onClick={() => openReview("approved")}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar cenário
                  </Button>
                </div>
              ) : (
                <p className="text-xs font-medium">A aprovação deve ser feita por um administrador deste cliente.</p>
              )}
            </div>
          )}
          {messages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTriggerWebhook}
              disabled={loading}
              className="w-full gap-2 text-xs"
            >
              <Webhook className="h-3.5 w-3.5" />
              Reiniciar com novo gatilho de webhook
            </Button>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Responda como se fosse o lead..."
              className="min-h-[44px] max-h-32 resize-none"
              disabled={loading}
            />
            <Button onClick={handleSend} disabled={loading || !input.trim()} size="icon" className="shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </SheetContent>
      <Dialog open={reviewStatus !== null} onOpenChange={(value) => !value && setReviewStatus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewStatus === "approved" ? "Aprovar cenário" : "Registrar ajuste"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{selectedScenario.title}</p>
            <Textarea
              value={reviewComment}
              onChange={(event) => setReviewComment(event.target.value.slice(0, 2000))}
              placeholder={reviewStatus === "approved" ? "Comentário opcional" : "Descreva o que o agente deve corrigir"}
              rows={4}
            />
            <p className="text-[11px] text-muted-foreground text-right">{reviewComment.length}/2000</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewStatus(null)}>Cancelar</Button>
            <Button onClick={submitReview} disabled={saveReview.isPending}>
              {saveReview.isPending ? "Salvando…" : "Confirmar avaliação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
