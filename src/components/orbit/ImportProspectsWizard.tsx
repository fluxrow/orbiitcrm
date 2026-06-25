import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import {
  Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  parseCsvFile, buildRecordsFromMapping, useImportProspectsWizard,
  SYSTEM_FIELD_OPTIONS, type SystemField, type ImportProgress, type ImportResult,
} from "@/hooks/useImportWizard";

type Step = "upload" | "mapping" | "preview" | "running" | "done";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  empresaId: string | null | undefined;
}

const REQUIRED_AT_LEAST_ONE: SystemField[] = [
  "nome_razao", "email_principal", "telefone", "whatsapp", "documento",
];

export function ImportProspectsWizard({ open, onOpenChange, empresaId }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<SystemField[]>([]);
  const [mergeMode, setMergeMode] = useState(true);
  const [progress, setProgress] = useState<ImportProgress>({ phase: "preparing", current: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);

  const importMutation = useImportProspectsWizard();

  const reset = () => {
    setStep("upload"); setFile(null); setHeaders([]); setRows([]);
    setMapping([]); setProgress({ phase: "preparing", current: 0, total: 0 }); setResult(null);
  };

  useEffect(() => { if (!open) reset(); }, [open]);

  const handleFile = async (f: File) => {
    setFile(f);
    const text = await f.text();
    const parsed = parseCsvFile(text);
    if (!parsed.headers.length || !parsed.rows.length) {
      toast.error("CSV vazio ou inválido.");
      return;
    }
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(parsed.autoMapping);
    setStep("mapping");
  };

  const updateMapping = (idx: number, value: SystemField) => {
    setMapping(prev => prev.map((m, i) => (i === idx ? value : m)));
  };

  const mappedSet = useMemo(() => new Set(mapping.filter(m => m !== "__extra__" && m !== "__ignore__")), [mapping]);
  const hasIdentifier = useMemo(
    () => mapping.some(m => REQUIRED_AT_LEAST_ONE.includes(m)),
    [mapping]
  );

  const preview = useMemo(() => {
    if (step !== "preview" && step !== "mapping") return { records: [], rowErrors: [] };
    return buildRecordsFromMapping(headers, rows, mapping);
  }, [headers, rows, mapping, step]);

  const runImport = async () => {
    if (!empresaId) { toast.error("Empresa não identificada."); return; }
    const { records } = buildRecordsFromMapping(headers, rows, mapping);
    if (!records.length) { toast.error("Nenhum registro válido para importar."); return; }
    setStep("running");
    try {
      const res = await importMutation.mutateAsync({
        records,
        empresaId,
        fileName: file?.name || "import.csv",
        mergeMode,
        onProgress: setProgress,
      });
      setResult(res);
      setStep("done");
      toast.success(`Importação concluída: ${res.inserted} novos · ${res.updated} atualizados`);
    } catch (e: any) {
      toast.error(e.message || "Falha ao importar.");
      setStep("preview");
    }
  };

  const progressPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const groups = Array.from(new Set(SYSTEM_FIELD_OPTIONS.map(o => o.group)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Prospects — {step === "upload" ? "Upload" : step === "mapping" ? "Mapeamento" : step === "preview" ? "Revisão" : step === "running" ? "Processando" : "Concluído"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {/* STEP 1: UPLOAD */}
          {step === "upload" && (
            <div
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDragOver={(e) => e.preventDefault()}
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
              <Upload className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">Arraste seu CSV ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground mt-2">
                Aceita qualquer planilha — você mapeia as colunas no próximo passo.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Colunas extras viram <strong>campos dinâmicos</strong> automaticamente.
              </p>
            </div>
          )}

          {/* STEP 2: MAPPING */}
          {step === "mapping" && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground flex items-center justify-between">
                <span><strong>{rows.length}</strong> linhas detectadas em <strong>{headers.length}</strong> colunas.</span>
                {!hasIdentifier && (
                  <span className="text-warning flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Mapeie ao menos 1 identificador (nome, e-mail, telefone ou documento).
                  </span>
                )}
              </div>
              <div className="border rounded-lg divide-y">
                {headers.map((h, idx) => {
                  const sample = rows.slice(0, 3).map(r => r[idx]).filter(Boolean).join(" · ");
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-3 p-3 items-center text-sm">
                      <div className="col-span-5">
                        <div className="font-medium truncate" title={h}>{h || `Coluna ${idx + 1}`}</div>
                        <div className="text-xs text-muted-foreground truncate" title={sample}>
                          {sample || <em>sem amostra</em>}
                        </div>
                      </div>
                      <div className="col-span-1 text-center text-muted-foreground">→</div>
                      <div className="col-span-6">
                        <Select value={mapping[idx]} onValueChange={(v) => updateMapping(idx, v as SystemField)}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {groups.map(g => (
                              <SelectGroup key={g}>
                                <SelectLabel>{g}</SelectLabel>
                                {SYSTEM_FIELD_OPTIONS.filter(o => o.group === g).map(o => (
                                  <SelectItem
                                    key={o.value}
                                    value={o.value}
                                    disabled={
                                      o.value !== "__extra__" &&
                                      o.value !== "__ignore__" &&
                                      mappedSet.has(o.value) &&
                                      mapping[idx] !== o.value
                                    }
                                  >
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Checkbox id="merge-wizard" checked={mergeMode} onCheckedChange={(v) => setMergeMode(!!v)} />
                <Label htmlFor="merge-wizard" className="text-sm cursor-pointer">
                  Atualizar duplicados (upsert por e-mail, telefone ou documento)
                </Label>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW */}
          {step === "preview" && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-2xl font-bold text-primary">{preview.records.length}</div>
                  <div className="text-xs text-muted-foreground">Registros válidos</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-2xl font-bold text-warning">{preview.rowErrors.length}</div>
                  <div className="text-xs text-muted-foreground">Linhas com aviso</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-2xl font-bold text-foreground">
                    {mapping.filter(m => m === "__extra__").length}
                  </div>
                  <div className="text-xs text-muted-foreground">Colunas → JSONB</div>
                </div>
              </div>

              <div>
                <Label className="text-xs">Amostra (primeiros 5):</Label>
                <div className="border rounded-lg mt-1 max-h-64 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2">Nome</th>
                        <th className="text-left p-2">Email</th>
                        <th className="text-left p-2">WhatsApp/Tel</th>
                        <th className="text-left p-2">Doc</th>
                        <th className="text-left p-2">Extras</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.records.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2 truncate max-w-[180px]">{r.nome_razao || "—"}</td>
                          <td className="p-2 truncate max-w-[180px]">{r.email_principal || "—"}</td>
                          <td className="p-2">{r.whatsapp || r.telefone || "—"}</td>
                          <td className="p-2">{r.cnpj_cpf ? `${r.cnpj_cpf} (${r.tipo_documento})` : "—"}</td>
                          <td className="p-2">
                            {Object.keys(r.dados_adicionais || {}).length > 0 ? (
                              <Badge variant="secondary">{Object.keys(r.dados_adicionais).length} campos</Badge>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {preview.rowErrors.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-warning">
                    {preview.rowErrors.length} aviso(s) — clique para ver
                  </summary>
                  <div className="mt-2 max-h-32 overflow-auto bg-muted/40 p-2 rounded">
                    {preview.rowErrors.slice(0, 30).map((e, i) => (
                      <div key={i}>Linha {e.row}: {e.message}</div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* STEP 4: RUNNING */}
          {step === "running" && (
            <div className="space-y-4 py-8">
              <div className="text-center">
                <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                <p className="mt-3 font-medium">
                  {progress.phase === "preparing" && "Preparando…"}
                  {progress.phase === "dedup" && "Verificando duplicados…"}
                  {progress.phase === "inserting" && `Inserindo lotes (${progress.current}/${progress.total})`}
                  {progress.phase === "updating" && `Atualizando duplicados (${progress.current}/${progress.total})`}
                  {progress.phase === "done" && "Finalizando…"}
                </p>
              </div>
              <Progress value={progressPct} />
              <p className="text-center text-xs text-muted-foreground">{progressPct}%</p>
            </div>
          )}

          {/* STEP 5: DONE */}
          {step === "done" && result && (
            <div className="space-y-4 py-4">
              <div className="text-center">
                <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
                <p className="mt-2 text-lg font-medium">Importação concluída</p>
                <p className="text-xs text-muted-foreground">Lista: <code>{result.listaTag}</code></p>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="rounded-lg border p-3">
                  <div className="text-2xl font-bold text-success">{result.inserted}</div>
                  <div className="text-xs text-muted-foreground">Novos</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-2xl font-bold text-primary">{result.updated}</div>
                  <div className="text-xs text-muted-foreground">Atualizados</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-2xl font-bold text-muted-foreground">{result.skipped}</div>
                  <div className="text-xs text-muted-foreground">Ignorados</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-2xl font-bold text-destructive">{result.errors.length}</div>
                  <div className="text-xs text-muted-foreground">Erros</div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-destructive">Ver erros</summary>
                  <div className="mt-2 max-h-32 overflow-auto bg-muted/40 p-2 rounded">
                    {result.errors.slice(0, 30).map((e, i) => <div key={i}>{e}</div>)}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-3">
          {step === "upload" && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          )}
          {step === "mapping" && (
            <>
              <Button variant="ghost" onClick={() => setStep("upload")}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button onClick={() => setStep("preview")} disabled={!hasIdentifier}>
                Próximo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="ghost" onClick={() => setStep("mapping")}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Ajustar mapeamento
              </Button>
              <Button onClick={runImport} disabled={!preview.records.length}>
                Importar {preview.records.length} registro(s)
              </Button>
            </>
          )}
          {step === "running" && (
            <Button disabled><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando…</Button>
          )}
          {step === "done" && (
            <>
              <Button variant="outline" onClick={reset}>Importar outro</Button>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
