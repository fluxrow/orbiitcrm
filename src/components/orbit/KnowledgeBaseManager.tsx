import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Upload, Link2, RefreshCw, Trash2, FileText, Loader2, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import {
  useOrbitAIKnowledge,
  useIngestKnowledgeUrl,
  useUploadKnowledgeDoc,
  useReprocessKnowledge,
  useToggleKnowledge,
  useDeleteKnowledge,
  type AIKnowledgeRow,
} from "@/hooks/useOrbitAIKnowledge";
import { toast } from "sonner";

const ACCEPT = ".pdf,.txt,.md,.docx";

function StatusBadge({ row }: { row: AIKnowledgeRow }) {
  if (row.status === "ready") return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Pronto</Badge>;
  if (row.status === "processing") return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Processando</Badge>;
  if (row.status === "pending") return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Aguardando</Badge>;
  return <Badge variant="destructive" className="gap-1" title={row.erro || ""}><AlertCircle className="h-3 w-3" /> Erro</Badge>;
}

interface Props {
  empresaId: string | null | undefined;
}

export function KnowledgeBaseManager({ empresaId }: Props) {
  const { data: rows = [], isLoading } = useOrbitAIKnowledge(empresaId);
  const ingestUrl = useIngestKnowledgeUrl();
  const uploadDoc = useUploadKnowledgeDoc();
  const reprocess = useReprocessKnowledge();
  const toggle = useToggleKnowledge();
  const remove = useDeleteKnowledge();

  const fileRef = useRef<HTMLInputElement>(null);
  const [urlValue, setUrlValue] = useState("");

  const onFile = async (file: File | null) => {
    if (!file || !empresaId) return;
    try {
      await uploadDoc.mutateAsync({ empresa_id: empresaId, file });
      toast.success("Arquivo enviado. Processamento iniciado.");
    } catch (e: any) {
      toast.error(e?.message || "Falha no upload");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const normalizeUrl = (raw: string): string | null => {
    let v = raw.trim();
    if (!v) return null;
    if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
    try {
      const u = new URL(v);
      if (!/^https?:$/.test(u.protocol)) return null;
      if (!u.hostname.includes(".")) return null;
      return u.toString();
    } catch {
      return null;
    }
  };

  const onAddUrl = async () => {
    if (!empresaId) return;
    const url = normalizeUrl(urlValue);
    if (!url) {
      toast.error("URL inválida. Use o formato https://exemplo.com");
      return;
    }
    try {
      await ingestUrl.mutateAsync({ empresa_id: empresaId, source_url: url });
      toast.success("URL adicionada. Processamento iniciado.");
      setUrlValue("");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao adicionar URL");
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload doc */}
      <div className="rounded-md border border-dashed p-4 flex items-center justify-between gap-3">
        <div>
          <Label className="text-sm font-medium">Subir documento</Label>
          <p className="text-xs text-muted-foreground">PDF, DOCX, TXT ou MD. Processamento ocorre em background.</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept={ACCEPT}
          onChange={(e) => onFile(e.target.files?.[0] || null)}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={uploadDoc.isPending || !empresaId}>
          {uploadDoc.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          Selecionar arquivo
        </Button>
      </div>

      {/* URL */}
      <div className="rounded-md border p-4 space-y-2">
        <Label className="text-sm font-medium flex items-center gap-2"><Link2 className="h-4 w-4" /> Adicionar URL (landing page, blog, FAQ)</Label>
        <div className="flex gap-2">
          <Input
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://exemplo.com/sobre"
            onKeyDown={(e) => { if (e.key === "Enter") onAddUrl(); }}
          />
          <Button onClick={onAddUrl} disabled={ingestUrl.isPending || !urlValue.trim() || !empresaId}>
            {ingestUrl.isPending ? <Loader2 className="h-4 w-4" /> : "Adicionar"}
          </Button>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Fontes ({rows.length})</Label>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground italic">Nenhuma fonte adicionada ainda.</p>
        )}
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.source_id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.titulo || r.source_url || r.storage_path || "Sem título"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.tipo} · {new Date(r.created_at).toLocaleString("pt-BR")}
                    {r.status === "error" && r.erro ? ` · ${r.erro}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge row={r} />
                <Switch
                  checked={r.ativo}
                  onCheckedChange={(v) => toggle.mutate({ source_id: r.source_id, ativo: v })}
                  title="Ativo na busca RAG"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => empresaId && reprocess.mutate({ empresa_id: empresaId, source_id: r.source_id, tipo: r.tipo })}
                  disabled={reprocess.isPending || r.status === "processing"}
                  title="Reprocessar"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm("Excluir esta fonte da base de conhecimento?")) {
                      remove.mutate({ source_id: r.source_id, storage_path: r.storage_path });
                    }
                  }}
                  title="Excluir"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
