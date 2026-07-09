import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Play, Pause, Mic, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useOrbitAudioLibrary, useCreateAudioClip, useDeleteAudioClip, useToggleAudioClip, AUDIO_CONTEXTOS, AudioClip } from "@/hooks/useOrbitAudioLibrary";
import { useSignedOrbitMedia } from "@/lib/orbit-media";
import { toast } from "sonner";

function AudioPlayer({ url }: { url: string }) {
  const { url: signed, refresh } = useSignedOrbitMedia(url);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };
  return (
    <div className="flex items-center gap-2">
      <audio ref={audioRef} src={signed || undefined} onEnded={() => setPlaying(false)} onError={refresh} className="hidden" />
      <Button variant="ghost" size="icon" onClick={toggle} className="h-7 w-7" disabled={!signed}>
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

export function AudioLibraryManager() {
  const { empresaId } = useTenant();
  const { data: clips = [], isLoading } = useOrbitAudioLibrary();
  const createClip = useCreateAudioClip();
  const deleteClip = useDeleteAudioClip();
  const toggleClip = useToggleAudioClip();

  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [contexto, setContexto] = useState("apresentacao");
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const resetModal = () => {
    setNome("");
    setContexto("apresentacao");
    setAudioBlob(null);
    if (audioBlobUrl) { URL.revokeObjectURL(audioBlobUrl); }
    setAudioBlobUrl(null);
    setIsRecording(false);
    setRecordingTime(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) { toast.error("Selecione um arquivo de áudio"); return; }
    if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
    setAudioBlob(file);
    setAudioBlobUrl(URL.createObjectURL(file));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 0) {
          if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
          setAudioBlob(blob);
          setAudioBlobUrl(URL.createObjectURL(blob));
        }
        setIsRecording(false);
        setRecordingTime(0);
      };
      mr.start(250);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch { toast.error("Não foi possível acessar o microfone"); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
  };

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Digite um nome para o áudio"); return; }
    if (!audioBlob) { toast.error("Grave ou selecione um arquivo de áudio"); return; }
    if (!empresaId) return;

    setIsUploading(true);
    try {
      const ext = audioBlob.type.includes("webm") ? "webm" : "ogg";
      const path = `${empresaId}/audios/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("orbit-media").upload(path, audioBlob, { contentType: audioBlob.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("orbit-media").getPublicUrl(path);
      await createClip.mutateAsync({ nome: nome.trim(), url: publicUrl, contexto });
      setOpen(false);
      resetModal();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar áudio");
    } finally {
      setIsUploading(false);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const labelFor = (v: string) => AUDIO_CONTEXTOS.find(c => c.value === v)?.label || v;

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Biblioteca de Áudios</h3>
          <p className="text-sm text-muted-foreground">Clips pré-gravados enviados pelo agente IA conforme o contexto da conversa</p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Adicionar clip
        </Button>
      </div>

      {clips.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <Mic className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>Nenhum clip na biblioteca ainda.</p>
          <p className="text-xs mt-1">Adicione clips e o agente IA os enviará automaticamente pelo contexto certo.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {clips.map((clip: AudioClip) => (
            <Card key={clip.id} className={!clip.ativo ? "opacity-50" : ""}>
              <CardContent className="p-3 flex items-center gap-3">
                <AudioPlayer url={clip.url} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{clip.nome}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-xs">{labelFor(clip.contexto)}</Badge>
                    {clip.uso_count > 0 && <span className="text-xs text-muted-foreground">{clip.uso_count}× usado</span>}
                  </div>
                </div>
                <Switch
                  checked={clip.ativo}
                  onCheckedChange={(v) => toggleClip.mutate({ id: clip.id, ativo: v })}
                  title={clip.ativo ? "Desativar" : "Ativar"}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => { if (confirm(`Remover "${clip.nome}"?`)) deleteClip.mutate(clip.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { if (!v) resetModal(); setOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adicionar clip à biblioteca</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nome do clip</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Boas-vindas padrão" className="mt-1" />
            </div>
            <div>
              <Label>Contexto</Label>
              <Select value={contexto} onValueChange={setContexto}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIO_CONTEXTOS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">O agente IA enviará este clip quando detectar o contexto correspondente.</p>
            </div>
            <div>
              <Label>Áudio</Label>
              <div className="mt-1 space-y-2">
                {audioBlobUrl ? (
                  <div className="flex items-center gap-2">
                    <audio controls src={audioBlobUrl} className="flex-1 h-8" />
                    <Button variant="ghost" size="sm" onClick={() => { URL.revokeObjectURL(audioBlobUrl!); setAudioBlob(null); setAudioBlobUrl(null); }}>
                      Remover
                    </Button>
                  </div>
                ) : isRecording ? (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/30">
                    <div className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
                    <span className="text-sm font-medium text-destructive flex-1">{formatTime(recordingTime)} — gravando...</span>
                    <Button size="sm" onClick={stopRecording} className="bg-destructive hover:bg-destructive/90">Parar</Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input type="file" ref={fileInputRef} accept="audio/*" onChange={handleFileSelect} className="hidden" />
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="flex-1">
                      <Upload className="h-3.5 w-3.5 mr-1" /> Carregar arquivo
                    </Button>
                    <Button variant="outline" size="sm" onClick={startRecording} className="flex-1">
                      <Mic className="h-3.5 w-3.5 mr-1" /> Gravar
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetModal(); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isUploading || !audioBlob || !nome.trim()}>
              {isUploading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Salvando...</> : "Salvar clip"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
