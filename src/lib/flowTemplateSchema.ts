// Schema Zod para import/export de templates de fluxo (versão 1).
// Também exporta helpers de placeholders para validar templates de mensagem.
import { z } from "zod";

export const FLOW_TEMPLATE_EXPORT_VERSION = 1;

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

export const FlowTemplateExportSchema = z.object({
  version: z.literal(FLOW_TEMPLATE_EXPORT_VERSION),
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

export function parseTemplateImport(txt: string):
  | { ok: true; data: FlowTemplateExport }
  | { ok: false; error: string } {
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
