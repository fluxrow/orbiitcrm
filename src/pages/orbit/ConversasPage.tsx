import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Send, MessageSquare, Bot, User, Loader2, CheckCircle, Paperclip, Mic, MicOff, X, Image as ImageIcon, FileText, Play, Square } from "lucide-react";
import { useOrbitConversas, useStartHumanTakeover, useEndHumanTakeover } from "@/hooks/useOrbitConversas";
import { useAuth } from "@/hooks/useAuth";
import { useOrbitMensagens, useSendMensagem } from "@/hooks/useOrbitMensagens";
import { useOrbitHandoff } from "@/hooks/useOrbitHandoffs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

function MediaPreview({ tipo_midia, url_midia, mensagem }: { tipo_midia: string | null; url_midia: string | null; mensagem?: string }) {
  if (!tipo_midia || !url_midia) return null;

  switch (tipo_midia) {
    case "image":
      return (
        <div className="mb-1">
          <a href={url_midia} target="_blank" rel="noopener noreferrer">
            <img src={url_midia} alt={mensagem || "Imagem"} className="max-w-full max-h-60 rounded-md object-cover cursor-pointer hover:opacity-90 transition-opacity" />
          </a>
        </div>
      );
    case "audio":
      return (
        <div className="mb-1">
          <audio controls className="max-w-full" preload="metadata">
            <source src={url_midia} />
          </audio>
        </div>
      );
    case "video":
      return (
        <div className="mb-1">
          <video controls className="max-w-full max-h-60 rounded-md" preload="metadata">
            <source src={url_midia} />
          </video>
        </div>
      );
    case "document":
      return (
        <a href={url_midia} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 mb-1 p-2 rounded bg-background/20 hover:bg-background/30 transition-colors">
          <FileText className="h-5 w-5 shrink-0" />
          <span className="text-sm underline truncate">{mensagem || "Documento"}</span>
        </a>
      );
    default:
      return null;
  }
}

export default function ConversasPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchParams] = useSearchParams();

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ file: File; previewUrl: string; tipo: string } | null>(null);

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

  const uploadFile = async (file: File): Promise<{ url: string; tipo: string }> => {
    const ext = file.name.split(".").pop() || "bin";
    const filePath = `${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from("orbit-media").upload(filePath, file, {
      contentType: file.type,
    });
    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from("orbit-media").getPublicUrl(filePath);

    let tipo = "document";
    if (file.type.startsWith("image/")) tipo = "image";
    else if (file.type.startsWith("audio/")) tipo = "audio";
    else if (file.type.startsWith("video/")) tipo = "video";

    return { url: publicUrl, tipo };
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 16 * 1024 * 1024; // 16MB
    if (file.size > maxSize) {
      toast.error("Arquivo muito grande (máx. 16MB)");
      return;
    }

    let tipo = "document";
    if (file.type.startsWith("image/")) tipo = "image";
    else if (file.type.startsWith("audio/")) tipo = "audio";
    else if (file.type.startsWith("video/")) tipo = "video";

    const previewUrl = tipo === "image" ? URL.createObjectURL(file) : "";

    setAttachedFile({ file, previewUrl, tipo });
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearAttachment = () => {
    if (attachedFile?.previewUrl) URL.revokeObjectURL(attachedFile.previewUrl);
    setAttachedFile(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setRecordingTime(0);

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;

        await sendAudioBlob(blob);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      const stream = mediaRecorderRef.current.stream;
      stream?.getTracks().forEach(t => t.stop());
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setRecordingTime(0);
    setIsRecording(false);
    chunksRef.current = [];
  };

  const sendAudioBlob = async (blob: Blob) => {
    if (!activeId) return;
    setIsUploading(true);
    try {
      const file = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
      const { url } = await uploadFile(file);
      await sendMessage.mutateAsync({
        conversa_id: activeId,
        mensagem: "🎙️ Áudio",
        telefone: active?.telefone_whatsapp,
        tipo_midia: "audio",
        url_midia: url,
      });
    } catch {
      toast.error("Erro ao enviar áudio");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    if (!activeId) return;

    // Send with attachment
    if (attachedFile) {
      setIsUploading(true);
      try {
        const { url, tipo } = await uploadFile(attachedFile.file);
        await sendMessage.mutateAsync({
          conversa_id: activeId,
          mensagem: msg.trim() || "",
          telefone: active?.telefone_whatsapp,
          tipo_midia: tipo,
          url_midia: url,
        });
        setMsg("");
        clearAttachment();
      } catch {
        toast.error("Erro ao enviar mídia");
      } finally {
        setIsUploading(false);
      }
      return;
    }

    // Send text only
    if (!msg.trim()) return;
    try {
      await sendMessage.mutateAsync({ conversa_id: activeId, mensagem: msg, telefone: active?.telefone_whatsapp });
      setMsg("");
    } catch {
      toast.error("Erro ao enviar");
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <OrbitLayout>
      <div className="flex h-[calc(100vh-120px)] border rounded-lg overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 border-r flex flex-col">
          <div className="p-4 border-b">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" /></div>
            <Tabs value={tab} onValueChange={setTab} className="mt-2"><TabsList className="w-full"><TabsTrigger value="all" className="flex-1">Todas</TabsTrigger><TabsTrigger value="whatsapp" className="flex-1">WA</TabsTrigger></TabsList></Tabs>
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> : filtered?.map((c) => (
              <div key={c.id} onClick={() => setActiveId(c.id)} className={`p-4 border-b cursor-pointer hover:bg-muted/50 ${activeId === c.id ? "bg-muted" : ""}`}>
                <div className="flex gap-3"><Avatar className="h-10 w-10"><AvatarFallback>{c.telefone_whatsapp[0]}</AvatarFallback></Avatar><div className="flex-1 min-w-0"><span className="font-medium truncate block">{(() => { const p = c.prospect as any; if (p?.nome_contato?.trim()) return p.nome_contato.trim(); const n = p?.nome_razao || ""; const d = n.replace(/\D/g, ""); if (/^\d{8,}$/.test(d) || n.startsWith("WhatsApp ")) return p?.nome_fantasia?.trim() || c.telefone_whatsapp; return n || c.telefone_whatsapp; })()}</span><p className="text-sm text-muted-foreground truncate">{c.ultima_mensagem_preview || "Sem mensagens"}</p></div></div>
              </div>
            ))}
          </ScrollArea>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {active ? (
            <>
              {/* Header */}
              <div className="p-4 border-b flex justify-between">
                <div className="flex gap-3"><Avatar><AvatarFallback>{active.telefone_whatsapp[0]}</AvatarFallback></Avatar><div><h3 className="font-semibold">{(() => { const p = active.prospect as any; if (p?.nome_contato?.trim()) return p.nome_contato.trim(); const n = p?.nome_razao || ""; const d = n.replace(/\D/g, ""); if (/^\d{8,}$/.test(d) || n.startsWith("WhatsApp ")) return p?.nome_fantasia?.trim() || active.telefone_whatsapp; return n || active.telefone_whatsapp; })()}</h3><div className="flex gap-2 flex-wrap"><Badge variant="outline">{active.human_talk ? <><User className="h-3 w-3 mr-1" />Humano</> : <><Bot className="h-3 w-3 mr-1" />IA</>}</Badge>{handoff?.status === "sent" && <Badge variant="secondary"><CheckCircle className="h-3 w-3 mr-1" />Vendedor notificado{handoff.vendedor?.nome ? ` • ${handoff.vendedor.nome}` : ""}{handoff.sent_at ? ` • ${format(new Date(handoff.sent_at), "dd/MM HH:mm")}` : ""}</Badge>}</div></div></div>
                <Button variant="outline" size="sm" onClick={() => active.human_talk ? release.mutateAsync(active.id) : assume.mutateAsync({ conversa_id: active.id, user_id: user?.id || "" })}>{active.human_talk ? "Devolver IA" : "Assumir"}</Button>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {mensagens?.map((m) => (
                    <div key={m.id} className={`flex ${m.direcao === "OUT" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] rounded-lg p-3 ${m.direcao === "OUT" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        <MediaPreview tipo_midia={m.tipo_midia} url_midia={m.url_midia} mensagem={m.mensagem || undefined} />
                        {/* Show text if there's no media or there's a caption */}
                        {(!m.tipo_midia || (m.mensagem && m.mensagem !== `📎 ${m.tipo_midia}` && m.mensagem !== "🎙️ Áudio")) && (
                          <p className="text-sm">{m.mensagem}</p>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs opacity-70">{m.timestamp ? format(new Date(m.timestamp), "HH:mm") : ""}</span>
                          {m.status === "simulated" && <span className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">Simulado</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
              </ScrollArea>

              {/* Attachment preview */}
              {attachedFile && (
                <div className="px-4 pt-2 flex items-center gap-2 border-t bg-muted/30">
                  {attachedFile.tipo === "image" && attachedFile.previewUrl ? (
                    <img src={attachedFile.previewUrl} alt="Preview" className="h-16 w-16 rounded object-cover" />
                  ) : (
                    <div className="h-16 w-16 rounded bg-muted flex items-center justify-center">
                      {attachedFile.tipo === "audio" ? <Mic className="h-6 w-6 text-muted-foreground" /> : <FileText className="h-6 w-6 text-muted-foreground" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{attachedFile.file.name}</p>
                    <p className="text-xs text-muted-foreground">{(attachedFile.file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={clearAttachment} className="shrink-0">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Input area */}
              <div className="p-4 border-t flex gap-2 items-center">
                {isRecording ? (
                  <>
                    <div className="flex-1 flex items-center gap-3 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30">
                      <div className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
                      <span className="text-sm font-medium text-destructive">{formatTime(recordingTime)}</span>
                      <span className="text-xs text-muted-foreground">Gravando áudio...</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={cancelRecording} title="Cancelar">
                      <X className="h-4 w-4" />
                    </Button>
                    <Button size="icon" onClick={stopRecording} title="Enviar áudio" className="bg-destructive hover:bg-destructive/90">
                      <Send className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
                      className="hidden"
                    />
                    <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isUploading} title="Anexar arquivo">
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={startRecording} disabled={isUploading} title="Gravar áudio">
                      <Mic className="h-4 w-4" />
                    </Button>
                    <Input
                      placeholder="Mensagem..."
                      value={msg}
                      onChange={(e) => setMsg(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                      className="flex-1"
                      disabled={isUploading}
                    />
                    <Button size="icon" onClick={handleSend} disabled={sendMessage.isPending || isUploading || (!msg.trim() && !attachedFile)}>
                      {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </>
                )}
              </div>
            </>
          ) : <div className="flex items-center justify-center h-full text-muted-foreground"><MessageSquare className="h-12 w-12 opacity-50" /></div>}
        </div>
      </div>
    </OrbitLayout>
  );
}
