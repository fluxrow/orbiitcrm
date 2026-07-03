import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, X, RotateCcw, MessageSquare, Lightbulb, Play, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAdvisorChat } from "@/hooks/useAdvisorChat";
import { useAdvisorSuggestions, isApplyable, type AdvisorSuggestion } from "@/hooks/useAdvisorSuggestions";
import { AdvisorApplyDialog } from "./AdvisorApplyDialog";
import { useTenant } from "@/contexts/TenantContext";
import { cn } from "@/lib/utils";


/**
 * AdvisorDock — FAB + Sheet lateral com o Orbit Advisor.
 * Fase 1: apenas leitura (chat + placeholder de Insights).
 * Aparece em todas rotas /{slug}/* quando o tenant está resolvido.
 */
export function AdvisorDock() {
  const { empresaId, isBlocked, notFound } = useTenant();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [applyTarget, setApplyTarget] = useState<AdvisorSuggestion | null>(null);
  const { messages, isStreaming, send, reset } = useAdvisorChat();
  const { data: suggestions = [], isLoading: sugLoading } = useAdvisorSuggestions();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);


  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 100);
  }, [open, messages.length]);

  if (!empresaId || isBlocked || notFound) return null;

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    await send(text);
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir Orbit Advisor"
        className={cn(
          "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full",
          "gradient-primary shadow-lg shadow-primary/30",
          "flex items-center justify-center",
          "hover:scale-105 active:scale-95 transition-transform",
          "ring-2 ring-primary/40",
        )}
      >
        <Sparkles className="h-6 w-6 text-primary-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[480px] p-0 flex flex-col bg-background border-l border-border"
        >
          <SheetHeader className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-base">
                <span className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary-foreground" />
                </span>
                Orbit Advisor
                <Badge variant="outline" className="text-[10px] ml-1">
                  {suggestions.length > 0 ? `${suggestions.length} sugestão(ões)` : "Ativo"}
                </Badge>

              </SheetTitle>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={reset} title="Nova conversa">
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SheetHeader>

          <Tabs defaultValue="chat" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-4 mt-3 grid grid-cols-2">
              <TabsTrigger value="chat" className="gap-2">
                <MessageSquare className="h-3.5 w-3.5" /> Chat
              </TabsTrigger>
              <TabsTrigger value="insights" className="gap-2">
                <Lightbulb className="h-3.5 w-3.5" /> Insights
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden mt-0 border-0">
              <ScrollArea className="flex-1 px-5 py-4">
                <div ref={scrollRef} className="space-y-4">
                  {messages.length === 0 && (
                    <div className="text-sm text-muted-foreground space-y-3">
                      <p>
                        Olá! Sou o Orbit Advisor. Posso analisar seu funil, fluxos e
                        conversas para sugerir otimizações.
                      </p>
                      <div className="grid gap-2">
                        {[
                          "Como está a saúde dos meus fluxos hoje?",
                          "Qual etapa do funil está com mais gargalo?",
                          "Analise meu Core Flow e sugira melhorias.",
                        ].map((s) => (
                          <button
                            key={s}
                            onClick={() => send(s)}
                            className="text-left text-xs px-3 py-2 rounded-md border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] text-sm rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed",
                          m.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground",
                        )}
                      >
                        {m.text}
                        {m.streaming && (
                          <span className="inline-block w-2 h-3 ml-1 bg-current animate-pulse" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <form
                onSubmit={handleSubmit}
                className="border-t border-border p-3 flex gap-2 items-end"
              >
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Pergunte ao Advisor…"
                  rows={2}
                  className="resize-none text-sm min-h-[44px]"
                  disabled={isStreaming}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={isStreaming || !input.trim()}
                  className="shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="insights" className="flex-1 overflow-auto px-5 py-6 mt-0 border-0">
              <div className="text-sm text-muted-foreground space-y-3">
                <div className="rounded-md border border-dashed border-border p-4 text-center">
                  <Lightbulb className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="font-medium text-foreground">Sugestões proativas em breve</p>
                  <p className="text-xs mt-1">
                    Nesta fase o Advisor só responde perguntas. O scanner automático
                    (Fase 2) vai popular esta aba com sugestões acionáveis e diff visual.
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}
