import { useState, useRef } from "react";
import { parseImportCSV, useImportClientes, ImportReport } from "@/hooks/useImportClientes";
import { useOrigens } from "@/hooks/useOrigens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, CheckCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Step = "upload" | "preview" | "result";

export default function ImportacaoPage() {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<any[]>([]);
  const [parseErrors, setParseErrors] = useState<{ row: number; message: string }[]>([]);
  const [origemId, setOrigemId] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: origens } = useOrigens();
  const importMutation = useImportClientes();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      toast.error("Apenas arquivos CSV são suportados");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows: parsed, errors } = parseImportCSV(text);
      setRows(parsed);
      setParseErrors(errors);
      setStep("preview");
    };
    reader.readAsText(file, "UTF-8");
  };

  const runImport = async () => {
    try {
      const result = await importMutation.mutateAsync({ rows, origemId: origemId || undefined });
      setReport(result);
      setStep("result");
      toast.success("Importação concluída!");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const reset = () => { setStep("upload"); setRows([]); setParseErrors([]); setReport(null); setOrigemId(""); if (fileRef.current) fileRef.current.value = ""; };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Importação de Clientes</h1>

      {step === "upload" && (
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center space-y-4">
          <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Selecione um arquivo CSV com dados de clientes e contatos</p>
          <p className="text-xs text-muted-foreground">Colunas suportadas: razao_social, nome_fantasia, cnpj, site, cidade, uf, segmento, contato_nome, email, telefone, whatsapp, cargo, decisor</p>
          <div className="flex justify-center gap-3">
            <Input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="max-w-xs" />
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <span className="font-medium">{rows.length} registros encontrados</span>
              {parseErrors.length > 0 && <Badge variant="destructive">{parseErrors.length} erros de parse</Badge>}
            </div>
            <div className="flex gap-2 items-center">
              <Select value={origemId} onValueChange={setOrigemId}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Vincular origem (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhuma</SelectItem>
                  {(origens || []).map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="max-h-[400px] overflow-auto border rounded-lg">
            <Table>
              <TableHeader><TableRow>
                <TableHead>#</TableHead>
                <TableHead>Razão Social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Cidade/UF</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Email</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, 50).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{i + 1}</TableCell>
                    <TableCell className="text-sm font-medium">{r.razao_social}</TableCell>
                    <TableCell className="text-sm">{r.cnpj || "—"}</TableCell>
                    <TableCell className="text-sm">{[r.cidade, r.uf].filter(Boolean).join("/") || "—"}</TableCell>
                    <TableCell className="text-sm">{r.contato_nome || "—"}</TableCell>
                    <TableCell className="text-sm">{r.contato_email || "—"}</TableCell>
                  </TableRow>
                ))}
                {rows.length > 50 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">... e mais {rows.length - 50} registros</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>

          {parseErrors.length > 0 && (
            <div className="bg-destructive/10 p-3 rounded-lg text-sm space-y-1">
              {parseErrors.map((e, i) => <div key={i} className="text-destructive"><AlertTriangle className="w-3 h-3 inline mr-1" />Linha {e.row}: {e.message}</div>)}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={reset}>Cancelar</Button>
            <Button onClick={runImport} disabled={rows.length === 0 || importMutation.isPending}>
              {importMutation.isPending ? "Importando..." : `Importar ${rows.length} registros`}
            </Button>
          </div>
        </div>
      )}

      {step === "result" && report && (
        <div className="space-y-4">
          <div className="bg-card border rounded-lg p-6 space-y-3">
            <div className="flex items-center gap-2 text-lg font-medium"><CheckCircle className="w-5 h-5 text-green-500" />Importação Concluída</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-green-500/10 p-3 rounded-lg"><div className="text-2xl font-bold text-green-600">{report.clientes_criados}</div><div className="text-xs text-muted-foreground">Clientes criados</div></div>
              <div className="bg-blue-500/10 p-3 rounded-lg"><div className="text-2xl font-bold text-blue-600">{report.clientes_atualizados}</div><div className="text-xs text-muted-foreground">Clientes atualizados</div></div>
              <div className="bg-purple-500/10 p-3 rounded-lg"><div className="text-2xl font-bold text-purple-600">{report.contatos_criados}</div><div className="text-xs text-muted-foreground">Contatos criados</div></div>
              <div className="bg-yellow-500/10 p-3 rounded-lg"><div className="text-2xl font-bold text-yellow-600">{report.duplicados_evitados}</div><div className="text-xs text-muted-foreground">Duplicados evitados</div></div>
            </div>
            {report.erros.length > 0 && (
              <div className="bg-destructive/10 p-3 rounded-lg text-sm space-y-1 max-h-[200px] overflow-auto">
                {report.erros.map((e, i) => <div key={i} className="text-destructive">Linha {e.row}: {e.message}</div>)}
              </div>
            )}
          </div>
          <Button onClick={reset}>Nova Importação</Button>
        </div>
      )}
    </div>
  );
}
