import { useState, useRef, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Webhook, Trash2, Loader2, ShieldCheck, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AgentSandboxAIConfig {
  prompt_identidade?: string;
  prompt_roteiro?: string;
  prompt_regras?: string;
  tom_conversa?: string;
  idioma?: string;
  max_tokens?: number;
  campos_qualificacao?: Array<{ label?: string; key?: string; required?: boolean }>;
}

interface AgentSandboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aiConfig: AgentSandboxAIConfig;
}

interface SandboxMsg {
  id: string;
  role: "assistant" | "user";
  content: string;
  ts: number;
}

const MOCK_LEAD = {
  nome: "Lead Teste",
  origem: "Formulário Site",
  telefone: "+55 11 99999-0000",
  email: "lead.teste@exemplo.com",
  cidade: "São Paulo",
  segmento: "Tecnologia",
  observacoes: "Veio de campanha de teste no sandbox.",
};

export function AgentSandbox({ open, onOpenChange, aiConfig }: AgentSandboxProps) {
  const [messages, setMessages] = useState<SandboxMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll
  useEffect(() => {
    const el = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  const callSandbox = useCallback(
    async (history: SandboxMsg[], trigger?: "inbound_webhook" | "manual") => {
      setLoading(true);
      setTyping(true);
      try {
        const { data, error } = await supabase.functions.invoke("orbit-ai-sandbox", {
          body: {
            aiConfig,
            mockLead: trigger === "inbound_webhook" ? MOCK_LEAD : null,
            trigger: trigger ?? "manual",
            messages: history.map((m) => ({ role: m.role, content: m.content })),
          },
        });
        if (error) throw error;
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
    [aiConfig],
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
        </SheetHeader>

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
    </Sheet>
  );
}
