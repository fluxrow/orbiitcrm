import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Send, Sparkles, MessageSquare, Bot, User, Loader2, CheckCircle } from "lucide-react";
import { useOrbitConversas, useStartHumanTakeover, useEndHumanTakeover } from "@/hooks/useOrbitConversas";
import { useAuth } from "@/hooks/useAuth";
import { useOrbitMensagens, useSendMensagem } from "@/hooks/useOrbitMensagens";
import { useOrbitHandoff } from "@/hooks/useOrbitHandoffs";
import { toast } from "sonner";
import { format } from "date-fns";

export default function ConversasPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();

  const { data: conversas, isLoading } = useOrbitConversas();
  const { data: mensagens } = useOrbitMensagens(activeId || undefined);
  const { user } = useAuth();
  const sendMessage = useSendMensagem();
  const assume = useStartHumanTakeover();
  const release = useEndHumanTakeover();
  const { data: handoff } = useOrbitHandoff(activeId || undefined);

  const filtered = conversas?.filter((c) => (tab === "all" || c.canal === tab) && (!search || c.telefone_whatsapp.includes(search)));
  const active = conversas?.find((c) => c.id === activeId);

  useEffect(() => {
    const idParam = searchParams.get("id");
    if (idParam) setActiveId(idParam);
  }, [searchParams]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensagens]);

  const handleSend = async () => {
    if (!msg.trim() || !activeId) return;
    try { await sendMessage.mutateAsync({ conversa_id: activeId, mensagem: msg, telefone: active?.telefone_whatsapp }); setMsg(""); } catch { toast.error("Erro ao enviar"); }
  };

  return (
    <OrbitLayout>
      <div className="flex h-[calc(100vh-120px)] border rounded-lg overflow-hidden">
        <div className="w-80 border-r flex flex-col">
          <div className="p-4 border-b">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div>
            <Tabs value={tab} onValueChange={setTab} className="mt-2"><TabsList className="w-full"><TabsTrigger value="all" className="flex-1">Todas</TabsTrigger><TabsTrigger value="whatsapp" className="flex-1">WA</TabsTrigger></TabsList></Tabs>
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> : filtered?.map((c) => (
              <div key={c.id} onClick={() => setActiveId(c.id)} className={`p-4 border-b cursor-pointer hover:bg-muted/50 ${activeId === c.id ? "bg-muted" : ""}`}>
                <div className="flex gap-3"><Avatar className="h-10 w-10"><AvatarFallback>{c.telefone_whatsapp[0]}</AvatarFallback></Avatar><div className="flex-1 min-w-0"><span className="font-medium truncate block">{(c.prospect as any)?.nome_razao || c.telefone_whatsapp}</span><p className="text-sm text-muted-foreground truncate">{c.ultima_mensagem_preview || "Sem mensagens"}</p></div></div>
              </div>
            ))}
          </ScrollArea>
        </div>
        <div className="flex-1 flex flex-col">
          {active ? (
            <>
              <div className="p-4 border-b flex justify-between">
                <div className="flex gap-3"><Avatar><AvatarFallback>{active.telefone_whatsapp[0]}</AvatarFallback></Avatar><div><h3 className="font-semibold">{(active.prospect as any)?.nome_razao || active.telefone_whatsapp}</h3><Badge variant="outline">{active.human_talk ? <><User className="h-3 w-3 mr-1" />Humano</> : <><Bot className="h-3 w-3 mr-1" />IA</>}</Badge></div></div>
                <Button variant="outline" size="sm" onClick={() => active.human_talk ? release.mutateAsync(active.id) : assume.mutateAsync({ conversa_id: active.id, user_id: user?.id || "" })}>{active.human_talk ? "Devolver IA" : "Assumir"}</Button>
              </div>
              <ScrollArea className="flex-1 p-4"><div className="space-y-4">{mensagens?.map((m) => <div key={m.id} className={`flex ${m.direcao === "OUT" ? "justify-end" : "justify-start"}`}><div className={`max-w-[70%] rounded-lg p-3 ${m.direcao === "OUT" ? "bg-primary text-primary-foreground" : "bg-muted"}`}><p className="text-sm">{m.mensagem}</p><div className="flex items-center gap-1.5"><span className="text-xs opacity-70">{m.timestamp ? format(new Date(m.timestamp), "HH:mm") : ""}</span>{m.status === "simulated" && <span className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">Simulado</span>}</div></div></div>)}<div ref={endRef} /></div></ScrollArea>
              <div className="p-4 border-t flex gap-2"><Input placeholder="Mensagem..." value={msg} onChange={(e) => setMsg(e.target.value)} onKeyPress={(e) => e.key === "Enter" && handleSend()} className="flex-1" /><Button size="icon" onClick={handleSend} disabled={sendMessage.isPending}><Send className="h-4 w-4" /></Button></div>
            </>
          ) : <div className="flex items-center justify-center h-full text-muted-foreground"><MessageSquare className="h-12 w-12 opacity-50" /></div>}
        </div>
      </div>
    </OrbitLayout>
  );
}
