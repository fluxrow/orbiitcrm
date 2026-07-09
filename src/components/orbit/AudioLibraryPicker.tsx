import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Music, Play, Pause, Send, Loader2 } from "lucide-react";
import { useOrbitAudioLibrary, AUDIO_CONTEXTOS, AudioClip } from "@/hooks/useOrbitAudioLibrary";
import { useSignedOrbitMediaUrl } from "@/lib/orbit-media";

interface AudioLibraryPickerProps {
  onSelect: (clip: AudioClip) => void;
  disabled?: boolean;
}

function MiniPlayer({ url }: { url: string }) {
  const signed = useSignedOrbitMediaUrl(url);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };
  return (
    <>
      <audio ref={audioRef} src={signed || undefined} onEnded={() => setPlaying(false)} className="hidden" />
      <Button variant="ghost" size="icon" onClick={toggle} className="h-6 w-6 shrink-0" disabled={!signed}>
        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </Button>
    </>
  );
}

export function AudioLibraryPicker({ onSelect, disabled }: AudioLibraryPickerProps) {
  const { data: clips = [], isLoading } = useOrbitAudioLibrary();
  const [open, setOpen] = useState(false);

  const activeClips = clips.filter((c: AudioClip) => c.ativo);
  const labelFor = (v: string) => AUDIO_CONTEXTOS.find(c => c.value === v)?.label || v;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || activeClips.length === 0}
          title={activeClips.length === 0 ? "Nenhum áudio na biblioteca" : "Biblioteca de áudios"}
        >
          <Music className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" side="top">
        <div className="p-3 border-b">
          <p className="text-sm font-medium">Biblioteca de Áudios</p>
          <p className="text-xs text-muted-foreground">{activeClips.length} clip{activeClips.length !== 1 ? "s" : ""} disponível{activeClips.length !== 1 ? "is" : ""}</p>
        </div>
        {isLoading ? (
          <div className="flex justify-center p-4"><Loader2 className="animate-spin h-4 w-4" /></div>
        ) : (
          <ScrollArea className="max-h-64">
            <div className="p-2 space-y-1">
              {activeClips.map((clip: AudioClip) => (
                <div key={clip.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/60">
                  <MiniPlayer url={clip.url} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{clip.nome}</p>
                    <Badge variant="outline" className="text-[10px] px-1 py-0">{labelFor(clip.contexto)}</Badge>
                  </div>
                  <Button
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => { onSelect(clip); setOpen(false); }}
                    title="Enviar este áudio"
                  >
                    <Send className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
