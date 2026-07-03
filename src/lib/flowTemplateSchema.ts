// Schema Zod para import/export de templates de fluxo (versão 1).
// Também exporta helpers de placeholders para validar templates de mensagem.
import { z } from "zod";

export const FLOW_TEMPLATE_EXPORT_VERSION = 1;
export const SUPPORTED_IMPORT_VERSIONS = [1] as const;

const actionConfigSchema = z.record(z.any());

const subActionSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    action_type: z.string().min(1),
    action_config: actionConfigSchema.default({}),
    delay_seconds: z.number().int().nonnegative().default(0),
  }),
);

const flowDefinitionSchema = z.object({
  trigger_type: z.string().min(1),
  trigger_config: z.record(z.any()).default({}),
  condicoes: z.record(z.any()).default({}),
  actions: z.array(subActionSchema).default([]),
});

// Aceita qualquer número na desserialização — a checagem de versão é manual
// para produzir mensagem de erro amigável.
export const FlowTemplateExportSchema = z.object({
  version: z.number().int(),
  nome: z.string().min(1).max(200),
  descricao: z.string().nullable().optional(),
  categoria: z.string().nullable().optional(),
  definicao: flowDefinitionSchema,
  exported_at: z.string().optional(),
  exported_from: z.string().optional(),
});

export type FlowTemplateExport = z.infer<typeof FlowTemplateExportSchema>;

export function buildTemplateExport(t: {
  nome: string;
  descricao?: string | null;
  categoria?: string | null;
  definicao: any;
}): FlowTemplateExport {
  return {
    version: FLOW_TEMPLATE_EXPORT_VERSION,
    nome: t.nome,
    descricao: t.descricao ?? null,
    categoria: t.categoria ?? null,
    definicao: t.definicao ?? { trigger_type: "lead_recebido", trigger_config: {}, condicoes: {}, actions: [] },
    exported_at: new Date().toISOString(),
    exported_from: "orbit-crm",
  };
}

export type ImportResult =
  | { ok: true; data: FlowTemplateExport }
  | { ok: false; error: string };

export function parseTemplateImport(txt: string): ImportResult {
  let raw: any;
  try {
    raw = JSON.parse(txt);
  } catch (e: any) {
    return { ok: false, error: `JSON inválido: ${e.message}` };
  }
  const parsed = FlowTemplateExportSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `${first.path.join(".") || "root"}: ${first.message}` };
  }
  if (!SUPPORTED_IMPORT_VERSIONS.includes(parsed.data.version as any)) {
    return {
      ok: false,
      error: `Versão ${parsed.data.version} não suportada. Versões suportadas: ${SUPPORTED_IMPORT_VERSIONS.join(", ")}.`,
    };
  }
  return { ok: true, data: parsed.data };
}

// ── Placeholders de templates de mensagem ────────────────────────────

// Whitelist de escopos válidos em templates. Qualquer coisa fora vira warning.
export const TEMPLATE_PLACEHOLDER_WHITELIST = [
  "prospect.nome",
  "prospect.email",
  "prospect.telefone",
  "prospect.whatsapp",
  "prospect.origem",
  "prospect.cidade",
  "prospect.estado",
  "prospect.tags",
  "deal.titulo",
  "deal.valor",
  "deal.status",
  "deal.etapa",
  "empresa.nome",
  "empresa.slug",
  "link_agendamento",
  "link_pagamento",
  "link_form",
  "vendedor.nome",
  "vendedor.telefone",
];

export function extractPlaceholders(text: string): string[] {
  if (!text) return [];
  const re = /\{\{\s*([^}\s]+)\s*\}\}/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) found.add(m[1]);
  return [...found];
}

export function validatePlaceholders(text: string): { unknown: string[]; known: string[] } {
  const all = extractPlaceholders(text);
  const known: string[] = [];
  const unknown: string[] = [];
  for (const p of all) {
    if (TEMPLATE_PLACEHOLDER_WHITELIST.includes(p) || p.startsWith("payload.") || p.startsWith("custom.")) {
      known.push(p);
    } else {
      unknown.push(p);
    }
  }
  return { known, unknown };
}

// Zod schema para o form quick-create/edit de template de mensagem.
export const MessageTemplateFormSchema = z.object({
  nome: z.string().trim().min(3, "Nome precisa de pelo menos 3 caracteres").max(120),
  canal: z.enum(["whatsapp", "email", "sms"]),
  categoria: z.string().trim().max(60).optional().nullable(),
  corpo_texto: z.string().trim().min(10, "Corpo precisa de pelo menos 10 caracteres").max(4000),
  assunto_email: z.string().trim().max(200).optional().nullable(),
});

export type MessageTemplateForm = z.infer<typeof MessageTemplateFormSchema>;

// ── Validação de import contra o tenant ──────────────────────────────

// Percorre recursivamente o objeto e extrai: placeholders de string, ids/slugs
// referenciados em ações conhecidas.
export type FlowImportInspection = {
  placeholders: string[];
  unknownPlaceholders: string[];
  usedTemplateIds: string[];
  usedAgentSlugs: string[];
};

const MSG_TEMPLATE_ACTIONS = new Set([
  "send_whatsapp_template",
  "send_email_template",
  "send_rich_media",
]);
const AI_AGENT_ACTIONS = new Set(["toggle_ai_agent"]);

function walkActions(actions: any[], visit: (a: any) => void) {
  if (!Array.isArray(actions)) return;
  for (const a of actions) {
    if (!a || typeof a !== "object") continue;
    visit(a);
    const cfg = a.action_config ?? {};
    if (Array.isArray(cfg?.then_actions)) walkActions(cfg.then_actions, visit);
    if (Array.isArray(cfg?.else_actions)) walkActions(cfg.else_actions, visit);
    if (Array.isArray(cfg?.cases)) {
      for (const c of cfg.cases) if (Array.isArray(c?.actions)) walkActions(c.actions, visit);
    }
    if (Array.isArray(cfg?.default_actions)) walkActions(cfg.default_actions, visit);
  }
}

function collectStringPlaceholders(node: any, out: Set<string>) {
  if (node == null) return;
  if (typeof node === "string") {
    for (const p of extractPlaceholders(node)) out.add(p);
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) collectStringPlaceholders(v, out);
    return;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node)) collectStringPlaceholders(v, out);
  }
}

export function inspectFlowDefinition(def: any): FlowImportInspection {
  const placeholders = new Set<string>();
  const templateIds = new Set<string>();
  const agentSlugs = new Set<string>();

  collectStringPlaceholders(def?.trigger_config ?? {}, placeholders);
  collectStringPlaceholders(def?.condicoes ?? {}, placeholders);

  walkActions(def?.actions ?? [], (a) => {
    collectStringPlaceholders(a.action_config ?? {}, placeholders);
    const cfg = a.action_config ?? {};
    if (MSG_TEMPLATE_ACTIONS.has(a.action_type)) {
      const id = cfg.template_id ?? cfg.templateId;
      if (typeof id === "string" && id.trim()) templateIds.add(id);
    }
    if (AI_AGENT_ACTIONS.has(a.action_type)) {
      const slug = cfg.agent_slug ?? cfg.slug;
      if (typeof slug === "string" && slug.trim()) agentSlugs.add(slug);
    }
  });

  const all = [...placeholders];
  const unknown = all.filter(
    (p) =>
      !TEMPLATE_PLACEHOLDER_WHITELIST.includes(p) &&
      !p.startsWith("payload.") &&
      !p.startsWith("custom."),
  );

  return {
    placeholders: all,
    unknownPlaceholders: unknown,
    usedTemplateIds: [...templateIds],
    usedAgentSlugs: [...agentSlugs],
  };
}

export type TenantValidationContext = {
  availableTemplateIds: string[];
  availableAgentSlugs: string[];
};

export type TenantValidationResult = {
  ok: boolean;
  blocking: boolean;
  inspection: FlowImportInspection;
  missingTemplateIds: string[];
  missingAgentSlugs: string[];
};

export function validateImportAgainstTenant(
  def: any,
  ctx: TenantValidationContext,
): TenantValidationResult {
  const inspection = inspectFlowDefinition(def);
  const missingTemplateIds = inspection.usedTemplateIds.filter(
    (id) => !ctx.availableTemplateIds.includes(id),
  );
  const missingAgentSlugs = inspection.usedAgentSlugs.filter(
    (s) => !ctx.availableAgentSlugs.includes(s),
  );
  const blocking = missingTemplateIds.length > 0 || missingAgentSlugs.length > 0;
  return {
    ok: !blocking && inspection.unknownPlaceholders.length === 0,
    blocking,
    inspection,
    missingTemplateIds,
    missingAgentSlugs,
  };
}

// Aplica um mapeamento de substituição {oldId: newId} nas ações de templates
// de mensagem e {oldSlug: newSlug} em toggle_ai_agent.
export function remapFlowDefinition(
  def: any,
  templateMap: Record<string, string>,
  agentMap: Record<string, string>,
): any {
  const cloned = JSON.parse(JSON.stringify(def ?? {}));
  walkActions(cloned?.actions ?? [], (a) => {
    const cfg = a.action_config ?? {};
    if (MSG_TEMPLATE_ACTIONS.has(a.action_type)) {
      const key = cfg.template_id ?? cfg.templateId;
      if (typeof key === "string" && templateMap[key]) {
        if ("template_id" in cfg) cfg.template_id = templateMap[key];
        if ("templateId" in cfg) cfg.templateId = templateMap[key];
      }
    }
    if (AI_AGENT_ACTIONS.has(a.action_type)) {
      const key = cfg.agent_slug ?? cfg.slug;
      if (typeof key === "string" && agentMap[key]) {
        if ("agent_slug" in cfg) cfg.agent_slug = agentMap[key];
        if ("slug" in cfg) cfg.slug = agentMap[key];
      }
    }
  });
  return cloned;
}

// Substitui recursivamente placeholders {{key}} nos valores string por
// `values[key]` quando presente. Usado para instanciar o Core Flow.
export function injectPlaceholderValues(def: any, values: Record<string, string>): any {
  const cloned = JSON.parse(JSON.stringify(def ?? {}));
  const re = /\{\{\s*([^}\s]+)\s*\}\}/g;
  const replaceString = (s: string) =>
    s.replace(re, (m, key) => (values[key] != null ? String(values[key]) : m));
  const walk = (node: any): any => {
    if (node == null) return node;
    if (typeof node === "string") return replaceString(node);
    if (Array.isArray(node)) return node.map(walk);
    if (typeof node === "object") {
      const out: any = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    return node;
  };
  return walk(cloned);
}
