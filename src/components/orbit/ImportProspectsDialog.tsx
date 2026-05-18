import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { parseProspectsCSV, useImportProspectsCSV, type ParsedProspectRow } from "@/hooks/useOrbitProspects";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  empresaId: string | null | undefined;
}

export function ImportProspectsDialog({ open, onOpenChange, empresaId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedProspectRow[]>([]);
  const [parseErrors, setParseErrors] = useState<{ row: number; message: string }[]>([]);
  const [mergeMode, setMergeMode] = useState(true);
  const importMutation = useImportProspectsCSV();

  const reset = () => { setFile(null); setRows([]); setParseErrors([]); };

  const handleFile = async (f: File) => {
    setFile(f);
    const text = await f.text();
    const { rows: parsed, errors } = parseProspectsCSV(text);
    setRows(parsed);
    setParseErrors(errors);
    if (!parsed.length) toast.error("Nenhuma linha válida encontrada no CSV.");
  };

  const handleImport = async () => {
    if (!empresaId) { toast.error("Empresa não identificada."); return; }
    if (!rows.length) { toast.error("Carregue um CSV válido."); return; }
    try {
      const res = await importMutation.mutateAsync({
        rows, empresaId, mergeMode, fileName: file?.name || "prospects.csv",
      });
      toast.success(
        `${res.inserted} novos · ${res.updated} atualizados · ${res.skipped} ignorados · ${res.mergedUntouched} sem alterações`
      );
      if (res.errors.length) toast.warning(`${res.errors.length} erro(s) durante a importação.`);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Falha ao importar.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar Prospects (CSV)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".csv,text/csv";
              input.onchange = (e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) handleFile(f);
              };
              input.click();
            }}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">{file ? file.name : "Arraste o CSV ou clique para selecionar"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Colunas reconhecidas: nome da empresa, cnpj, e-mail, telefone, whatsapp, cidade, estado, segmento, origem, observações, tags
            </p>
          </div>

          {rows.length > 0 && (
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <p><strong>{rows.length}</strong> linhas válidas detectadas.</p>
              {parseErrors.length > 0 && (
                <p className="text-warning">{parseErrors.length} linha(s) descartada(s).</p>
              )}
              <div className="max-h-40 overflow-auto mt-2 text-xs text-muted-foreground">
                {rows.slice(0, 5).map((r, i) => (
                  <div key={i} className="truncate">
                    {r.nome_razao} · {r.email_principal || "—"} · {r.telefone || r.whatsapp || "—"} · {r.cidade || "—"}/{r.estado || "—"}
                  </div>
                ))}
                {rows.length > 5 && <div className="italic">… +{rows.length - 5} linhas</div>}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox id="merge" checked={mergeMode} onCheckedChange={(v) => setMergeMode(!!v)} />
            <Label htmlFor="merge" className="text-sm cursor-pointer">
              Atualizar duplicados (preenche campos vazios em prospects já existentes por email ou telefone)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importMutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={!rows.length || importMutation.isPending}>
            {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Importar {rows.length > 0 && `(${rows.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
