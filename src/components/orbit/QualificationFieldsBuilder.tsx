import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, ArrowUp, ArrowDown } from "lucide-react";

export interface QualificationField {
  key: string;
  label: string;
  pergunta: string;
  tipo: "text" | "number" | "select" | "boolean";
  required: boolean;
  opcoes?: string[];
}

function slugify(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

interface Props {
  value: QualificationField[];
  onChange: (next: QualificationField[]) => void;
}

export function QualificationFieldsBuilder({ value, onChange }: Props) {
  const fields = useMemo(() => Array.isArray(value) ? value : [], [value]);

  const update = (i: number, patch: Partial<QualificationField>) => {
    const next = fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f));
    // re-derive key from label if label changed and key was auto
    if (patch.label !== undefined) {
      const f = next[i];
      next[i] = { ...f, key: slugify(f.label) || `campo_${i + 1}` };
    }
    onChange(next);
  };
  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () =>
    onChange([
      ...fields,
      { key: `campo_${fields.length + 1}`, label: "Nova pergunta", pergunta: "", tipo: "text", required: false },
    ]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base">Perguntas de Qualificação</Label>
          <p className="text-xs text-muted-foreground">
            A IA fará essas perguntas durante a conversa e salvará as respostas em <code>dados_adicionais</code> do prospect.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground italic">Nenhuma pergunta configurada. Clique em "Adicionar".</p>
      )}

      <div className="space-y-3">
        {fields.map((f, i) => (
          <div key={i} className="rounded-md border p-3 space-y-2 bg-muted/30">
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(i, 1)} disabled={i === fields.length - 1}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Rótulo</Label>
                  <Input value={f.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Ex: Faturamento mensal" />
                  <p className="text-[10px] text-muted-foreground">Chave: <code>{f.key}</code></p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={f.tipo} onValueChange={(v) => update(i, { tipo: v as QualificationField["tipo"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="number">Número</SelectItem>
                      <SelectItem value="select">Opções</SelectItem>
                      <SelectItem value="boolean">Sim/Não</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs">Pergunta da IA</Label>
                  <Input
                    value={f.pergunta}
                    onChange={(e) => update(i, { pergunta: e.target.value })}
                    placeholder="Como a IA deve perguntar isso?"
                  />
                </div>
                {f.tipo === "select" && (
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Opções (separadas por vírgula)</Label>
                    <Input
                      value={(f.opcoes || []).join(", ")}
                      onChange={(e) => update(i, { opcoes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      placeholder="Ex: até 10k, 10-50k, 50-200k, +200k"
                    />
                  </div>
                )}
                <div className="flex items-center gap-2 md:col-span-2">
                  <Switch checked={f.required} onCheckedChange={(v) => update(i, { required: v })} />
                  <span className="text-xs">Obrigatório</span>
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
