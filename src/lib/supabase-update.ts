import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type PublicTables = Database["public"]["Tables"];

/** Type-safe Update payload for any public table. */
export type TableUpdate<T extends keyof PublicTables> = PublicTables[T]["Update"];

/**
 * Whitelist of updatable columns per supported table.
 * Keep in sync with `Database["public"]["Tables"][T]["Update"]`.
 */
const ALLOWED_UPDATE_COLUMNS = {
  oportunidades: [
    "cliente_id", "closed_at", "created_at", "created_by_user_id",
    "data_ida", "data_volta", "destino", "etapa_id", "etapa_nome_snapshot",
    "id", "motivo_perda", "organization_id", "owner_user_id", "probabilidade",
    "status", "titulo", "updated_at", "valor_total_estimado", "viajantes_qtd",
  ],
  orbit_prospects: [
    "cidade", "cnpj_cpf", "consentimento_email", "consentimento_whatsapp",
    "created_at", "dados_adicionais", "deleted_at", "email_principal",
    "empresa_id", "estado", "id", "nome_contato", "nome_fantasia", "nome_razao",
    "observacoes", "optout_email", "optout_whatsapp", "origem_contato",
    "origem_lead", "responsavel_id", "score", "segmento", "status_qualificacao",
    "tags", "telefone", "tipo", "tipo_documento", "updated_at", "whatsapp",
    "whatsapp_last_check_at", "whatsapp_status",
  ],
} as const satisfies Record<string, readonly string[]>;

export type UpdatableTable = keyof typeof ALLOWED_UPDATE_COLUMNS;

// ============================================================================
// Zod runtime validation schemas
// ============================================================================

const isoDateLike = z
  .string()
  .min(1)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Data inválida" });

const uuid = z.string().uuid({ message: "ID inválido" });

/** Permissive nullable wrapper — Supabase accepts null to clear a column. */
const nullable = <T extends z.ZodTypeAny>(s: T) => s.nullable().optional();

const oportunidadesUpdateSchema = z
  .object({
    cliente_id: nullable(uuid),
    closed_at: nullable(isoDateLike),
    created_at: nullable(isoDateLike),
    created_by_user_id: nullable(uuid),
    data_ida: nullable(isoDateLike),
    data_volta: nullable(isoDateLike),
    destino: nullable(z.string().trim().max(255)),
    etapa_id: nullable(uuid),
    etapa_nome_snapshot: nullable(z.string().trim().max(255)),
    id: uuid.optional(),
    motivo_perda: nullable(z.string().trim().max(1000)),
    organization_id: nullable(uuid),
    owner_user_id: nullable(uuid),
    probabilidade: nullable(z.number().int().min(0).max(100)),
    status: nullable(z.string().trim().max(50)),
    titulo: nullable(z.string().trim().min(1).max(255)),
    updated_at: nullable(isoDateLike),
    valor_total_estimado: nullable(z.number().finite().min(0)),
    viajantes_qtd: nullable(z.number().int().min(0).max(10000)),
  })
  .strict();

const orbitProspectsUpdateSchema = z
  .object({
    cidade: nullable(z.string().trim().max(120)),
    cnpj_cpf: nullable(z.string().trim().max(32)),
    consentimento_email: nullable(z.boolean()),
    consentimento_whatsapp: nullable(z.boolean()),
    created_at: nullable(isoDateLike),
    dados_adicionais: nullable(z.any()),
    deleted_at: nullable(isoDateLike),
    email_principal: nullable(z.string().trim().email().max(255).or(z.literal(""))),
    empresa_id: nullable(uuid),
    estado: nullable(z.string().trim().max(64)),
    id: uuid.optional(),
    nome_contato: nullable(z.string().trim().max(255)),
    nome_fantasia: nullable(z.string().trim().max(255)),
    nome_razao: nullable(z.string().trim().min(1).max(255)),
    observacoes: nullable(z.string().trim().max(5000)),
    optout_email: nullable(z.boolean()),
    optout_whatsapp: nullable(z.boolean()),
    origem_contato: nullable(z.string().trim().max(120)),
    origem_lead: nullable(z.string().trim().max(120)),
    responsavel_id: nullable(uuid),
    score: nullable(z.number().int().min(0).max(1000)),
    segmento: nullable(z.string().trim().max(120)),
    status_qualificacao: nullable(z.string().trim().max(64)),
    tags: nullable(z.array(z.string().trim().max(64)).max(100)),
    telefone: nullable(z.string().trim().max(32)),
    tipo: nullable(z.string().trim().max(32)),
    tipo_documento: nullable(z.string().trim().max(16)),
    updated_at: nullable(isoDateLike),
    whatsapp: nullable(z.string().trim().max(32)),
    whatsapp_last_check_at: nullable(isoDateLike),
    whatsapp_status: nullable(z.string().trim().max(32)),
  })
  .strict();

const UPDATE_SCHEMAS = {
  oportunidades: oportunidadesUpdateSchema,
  orbit_prospects: orbitProspectsUpdateSchema,
} as const satisfies Record<UpdatableTable, z.ZodTypeAny>;

export class SupabaseUpdateValidationError extends Error {
  issues: z.ZodIssue[];
  table: UpdatableTable;
  constructor(table: UpdatableTable, issues: z.ZodIssue[]) {
    super(
      `Invalid update payload for "${table}": ` +
        issues.map((i) => `${i.path.join(".") || "(root)"} — ${i.message}`).join("; ")
    );
    this.name = "SupabaseUpdateValidationError";
    this.table = table;
    this.issues = issues;
  }
}

/**
 * Strip unknown keys from a Supabase update payload AND validate the remaining
 * fields against a zod schema. Returns a value typed as the table's `Update`
 * row. Throws `SupabaseUpdateValidationError` on invalid data.
 */
export function pickUpdate<T extends UpdatableTable>(
  table: T,
  payload: Record<string, unknown>
): TableUpdate<T & keyof PublicTables> {
  const allowed = ALLOWED_UPDATE_COLUMNS[table] as readonly string[];
  const allowedSet = new Set<string>(allowed);
  const cleaned: Record<string, unknown> = {};
  const rejected: string[] = [];

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (allowedSet.has(key)) cleaned[key] = value;
    else rejected.push(key);
  }

  if (rejected.length && import.meta.env?.DEV) {
    console.warn(`[supabase-update] Dropped unknown column(s) on "${table}":`, rejected);
  }

  const schema = UPDATE_SCHEMAS[table];
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    if (import.meta.env?.DEV) {
      console.error(`[supabase-update] Validation failed for "${table}"`, result.error.issues);
    }
    throw new SupabaseUpdateValidationError(table, result.error.issues);
  }

  return result.data as TableUpdate<T & keyof PublicTables>;
}
