import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Microscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type RaioXPair = { key: string; value: string };

const MAX_PREVIEW = 240;

/**
 * Parser tolerante para dados_adicionais (JSONB):
 *  - Array de objetos { pergunta, resposta } ou { question, answer } ou { label, value }
 *  - Objeto plano { chave: valor }
 *  - String JSON (faz parse)
 *  - Qualquer outra coisa → ignora (retorna [])
 * Mantém a ordem original do JSON.
 */
function parseDadosAdicionais(raw: unknown): RaioXPair[] {
  if (!raw) return [];
  let data: any = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return [{ key: "Observação", value: data }];
    }
  }
  if (Array.isArray(data)) {
    return data
      .map((item, i): RaioXPair | null => {
        if (item == null) return null;
        if (typeof item === "string") return { key: `Item ${i + 1}`, value: item };
        if (typeof item === "object") {
          const k = item.pergunta ?? item.question ?? item.label ?? item.key ?? item.name;
          const v = item.resposta ?? item.answer ?? item.value ?? item.text;
          if (k != null && v != null) return { key: String(k), value: stringify(v) };
        }
        return null;
      })
      .filter((p): p is RaioXPair => !!p);
  }
  if (typeof data === "object") {
    return Object.entries(data).map(([k, v]) => ({ key: prettifyKey(k), value: stringify(v) }));
  }
  return [];
}

function prettifyKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function stringify(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function ProspectRaioX({ dadosAdicionais }: { dadosAdicionais: unknown }) {
  const pairs = useMemo(() => parseDadosAdicionais(dadosAdicionais), [dadosAdicionais]);
  const [open, setOpen] = useState(false);

  if (pairs.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-brand/20 bg-brand/[0.04] p-3">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between text-left">
            <div className="flex items-center gap-2">
              <Microscope className="h-4 w-4 text-brand" />
              <span className="text-sm font-medium">Raio-X da Qualificação</span>
              <span className="text-[10px] text-muted-foreground">
                {pairs.length} resposta{pairs.length === 1 ? "" : "s"}
              </span>
            </div>
            {open ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-2">
          {pairs.map((p, i) => (
            <RaioXRow key={`${p.key}-${i}`} pair={p} />
          ))}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function RaioXRow({ pair }: { pair: RaioXPair }) {
  const [expanded, setExpanded] = useState(false);
  const long = pair.value.length > MAX_PREVIEW;
  const shown = expanded || !long ? pair.value : `${pair.value.slice(0, MAX_PREVIEW)}…`;
  return (
    <div className="text-xs">
      <div className="text-muted-foreground">{pair.key}</div>
      <div className="text-foreground whitespace-pre-wrap break-words">
        {shown}
        {long && (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 ml-1 text-[11px] text-brand"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "ver menos" : "ver mais"}
          </Button>
        )}
      </div>
    </div>
  );
}
