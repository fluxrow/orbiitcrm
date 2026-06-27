import type { Database } from "@/integrations/supabase/types";

type PublicTables = Database["public"]["Tables"];

/** Type-safe Update payload for any public table. */
export type TableUpdate<T extends keyof PublicTables> = PublicTables[T]["Update"];

/**
 * Whitelist of updatable columns per supported table.
 * Keep in sync with `Database["public"]["Tables"][T]["Update"]`.
 * Anything not listed here is stripped at runtime before hitting Supabase,
 * which avoids `RejectExcessProperties` TS errors AND blocks accidental
 * writes to columns the caller shouldn't be touching.
 */
const ALLOWED_UPDATE_COLUMNS = {
  oportunidades: [
    "cliente_id",
    "closed_at",
    "created_at",
    "created_by_user_id",
    "data_ida",
    "data_volta",
    "destino",
    "etapa_id",
    "etapa_nome_snapshot",
    "id",
    "motivo_perda",
    "organization_id",
    "owner_user_id",
    "probabilidade",
    "status",
    "titulo",
    "updated_at",
    "valor_total_estimado",
    "viajantes_qtd",
  ],
  orbit_prospects: [
    "cidade",
    "cnpj_cpf",
    "consentimento_email",
    "consentimento_whatsapp",
    "created_at",
    "dados_adicionais",
    "deleted_at",
    "email_principal",
    "empresa_id",
    "estado",
    "id",
    "nome_contato",
    "nome_fantasia",
    "nome_razao",
    "observacoes",
    "optout_email",
    "optout_whatsapp",
    "origem_contato",
    "origem_lead",
    "responsavel_id",
    "score",
    "segmento",
    "status_qualificacao",
    "tags",
    "telefone",
    "tipo",
    "tipo_documento",
    "updated_at",
    "whatsapp",
    "whatsapp_last_check_at",
    "whatsapp_status",
  ],
} as const satisfies Record<keyof PublicTables | string, readonly string[]>;

export type UpdatableTable = keyof typeof ALLOWED_UPDATE_COLUMNS;

/**
 * Strip unknown keys from a Supabase update payload, returning a value typed
 * as the table's `Update` row. Unknown keys are dropped and reported via
 * `console.warn` in dev so callers notice typos/legacy fields.
 */
export function pickUpdate<T extends UpdatableTable>(
  table: T,
  payload: Record<string, unknown>
): TableUpdate<T & keyof PublicTables> {
  const allowed = ALLOWED_UPDATE_COLUMNS[table] as readonly string[];
  const allowedSet = new Set<string>(allowed);
  const out: Record<string, unknown> = {};
  const rejected: string[] = [];

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (allowedSet.has(key)) out[key] = value;
    else rejected.push(key);
  }

  if (rejected.length && import.meta.env?.DEV) {
    console.warn(
      `[supabase-update] Dropped unknown column(s) on "${table}":`,
      rejected
    );
  }

  return out as TableUpdate<T & keyof PublicTables>;
}
