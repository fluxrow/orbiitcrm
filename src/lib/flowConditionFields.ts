// Catálogo de campos e operadores para condições de fluxo (if/else).
// Compartilhado entre o construtor (UI) e usado como referência do executor.

export type ConditionOp =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_empty"
  | "is_not_empty"
  | "in";

export type ConditionRule = {
  field: string; // ex.: "prospect.documento_tipo", "deal.valor", "payload.utm_source"
  op: ConditionOp;
  value?: string;
};

export type ConditionGroup = {
  logic: "AND" | "OR";
  rules: ConditionRule[];
};

export type IfElseConfig = {
  condition: ConditionGroup;
  then: Array<{ action_type: string; action_config: Record<string, any>; delay_seconds: number }>;
  else: Array<{ action_type: string; action_config: Record<string, any>; delay_seconds: number }>;
};

export const OP_LABELS: Record<ConditionOp, string> = {
  equals: "= igual a",
  not_equals: "≠ diferente de",
  contains: "contém",
  not_contains: "não contém",
  gt: "> maior que",
  gte: "≥ maior ou igual",
  lt: "< menor que",
  lte: "≤ menor ou igual",
  is_empty: "está vazio",
  is_not_empty: "não está vazio",
  in: "está em (lista, separado por vírgula)",
};

export const OPS_NEEDING_VALUE: ConditionOp[] = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
];

export type FieldDef = { value: string; label: string; hint?: string };
export type FieldGroup = { label: string; fields: FieldDef[] };

export const FLOW_CONDITION_FIELDS: FieldGroup[] = [
  {
    label: "Prospect",
    fields: [
      { value: "prospect.nome", label: "Nome" },
      { value: "prospect.email", label: "E-mail" },
      { value: "prospect.telefone", label: "Telefone" },
      { value: "prospect.whatsapp", label: "WhatsApp" },
      { value: "prospect.documento", label: "Documento (CPF/CNPJ)" },
      { value: "prospect.documento_tipo", label: "Tipo do documento (CPF|CNPJ)" },
      { value: "prospect.origem", label: "Origem" },
      { value: "prospect.status", label: "Status" },
      { value: "prospect.qualificado", label: "Qualificado (true/false)" },
      { value: "prospect.tags", label: "Tags" },
      { value: "prospect.cidade", label: "Cidade" },
      { value: "prospect.estado", label: "Estado" },
    ],
  },
  {
    label: "Deal (Oportunidade)",
    fields: [
      { value: "deal.valor", label: "Valor" },
      { value: "deal.etapa_id", label: "Etapa (ID)" },
      { value: "deal.etapa_slug", label: "Etapa (slug)" },
      { value: "deal.status", label: "Status" },
      { value: "deal.titulo", label: "Título" },
      { value: "deal.responsavel_id", label: "Responsável (ID)" },
      { value: "deal.moved_at", label: "Última movimentação" },
    ],
  },
  {
    label: "Payload do gatilho",
    fields: [
      { value: "payload.utm_source", label: "utm_source" },
      { value: "payload.utm_medium", label: "utm_medium" },
      { value: "payload.utm_campaign", label: "utm_campaign" },
      { value: "payload.source", label: "source (raw)" },
    ],
  },
];

// ── Avaliador puro (para preview no cliente; backend tem cópia própria em Deno) ──

export function getFieldValue(ctx: Record<string, any>, field: string): any {
  const [scope, ...rest] = field.split(".");
  const key = rest.join(".");
  const source = ctx?.[scope];
  if (source == null) return undefined;
  if (!key) return source;
  return key.split(".").reduce<any>((o, k) => (o == null ? o : o[k]), source);
}

export function evaluateRule(v: any, op: ConditionOp, expected: any): boolean {
  const asNum = (x: any) => (typeof x === "number" ? x : Number(x));
  const strV = (x: any) => (x == null ? "" : String(x));
  switch (op) {
    case "equals": return strV(v) === strV(expected);
    case "not_equals": return strV(v) !== strV(expected);
    case "contains": return strV(v).toLowerCase().includes(strV(expected).toLowerCase());
    case "not_contains": return !strV(v).toLowerCase().includes(strV(expected).toLowerCase());
    case "gt": return asNum(v) > asNum(expected);
    case "gte": return asNum(v) >= asNum(expected);
    case "lt": return asNum(v) < asNum(expected);
    case "lte": return asNum(v) <= asNum(expected);
    case "is_empty":
      return v == null || v === "" || (Array.isArray(v) && v.length === 0);
    case "is_not_empty":
      return !(v == null || v === "" || (Array.isArray(v) && v.length === 0));
    case "in": {
      const list = strV(expected).split(",").map((s) => s.trim()).filter(Boolean);
      return list.includes(strV(v));
    }
    default:
      return false;
  }
}

export function evaluateCondition(ctx: Record<string, any>, cond?: ConditionGroup): boolean {
  const rules = cond?.rules ?? [];
  if (!rules.length) return true;
  const logic = cond?.logic === "OR" ? "OR" : "AND";
  const results = rules.map((r) => evaluateRule(getFieldValue(ctx, r.field), r.op, r.value));
  return logic === "OR" ? results.some(Boolean) : results.every(Boolean);
}
