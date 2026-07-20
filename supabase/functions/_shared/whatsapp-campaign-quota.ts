// _shared/whatsapp-campaign-quota.ts
// Fonte única da regra de cota diária + warmup para envios de campanha WhatsApp.
// Reutilizada por:
//   - send-orbit-campaign        (execução real do envio)
//   - orbit-campaign-scheduler-tick (decisão de auto-resume de pausada_por_limite)
//
// Qualquer ajuste na cota deve ser feito aqui, jamais duplicado.

export interface CampaignSendingConfig {
  min_delay_ms: number;
  max_delay_ms: number;
  batch_size: number;
  batch_pause_ms: number;
  daily_limit: number;
  max_per_minute: number;
  warmup_enabled: boolean;
  warmup_start_date: string | null;
  enabled: boolean;
}

export const DEFAULT_CAMPAIGN_CONFIG: CampaignSendingConfig = {
  min_delay_ms: 1500,
  max_delay_ms: 3500,
  batch_size: 50,
  batch_pause_ms: 30000,
  daily_limit: 500,
  max_per_minute: 15,
  warmup_enabled: false,
  warmup_start_date: null,
  enabled: true,
};

export const WARMUP_SCALE = [50, 80, 120, 200, 300, 500];

/**
 * Retorna cota efetiva do dia respeitando warmup progressivo.
 * Se warmup desativado, retorna daily_limit puro.
 * Se warmup ativo, aplica escala até atingir o teto config.daily_limit.
 */
export function getEffectiveDailyLimit(
  config: CampaignSendingConfig,
  now: Date = new Date(),
): { limit: number; delayMultiplier: number } {
  if (!config.warmup_enabled || !config.warmup_start_date) {
    return { limit: config.daily_limit, delayMultiplier: 1 };
  }
  const startDate = new Date(config.warmup_start_date);
  const daysDiff = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const dayIndex = Math.max(0, daysDiff);
  const scaled = dayIndex < WARMUP_SCALE.length ? WARMUP_SCALE[dayIndex] : config.daily_limit;
  const delayMultiplier = dayIndex < 3 ? 1.5 : 1;
  return { limit: Math.min(scaled, config.daily_limit), delayMultiplier };
}

/**
 * Decisão pura de auto-resume: retorna true quando o uso atual do dia ainda cabe
 * dentro da cota efetiva. Usada pelo scheduler para promover
 * pausada_por_limite -> aprovada_para_envio.
 */
export function canResumePausadaPorLimite(params: {
  config: CampaignSendingConfig;
  dailySentCount: number;
  now?: Date;
}): { resume: boolean; effectiveLimit: number; remaining: number } {
  const { limit } = getEffectiveDailyLimit(params.config, params.now ?? new Date());
  const remaining = limit - (params.dailySentCount ?? 0);
  return { resume: remaining > 0, effectiveLimit: limit, remaining };
}

/**
 * Carrega config de envio do tenant, aplicando defaults sem duplicar chaves.
 * `supabase` deve ser um client com service role.
 */
export async function loadCampaignSendingConfig(
  supabase: any,
  empresaId: string,
): Promise<CampaignSendingConfig> {
  const { data: row } = await supabase
    .from("orbit_whatsapp_sending_config")
    .select(
      "min_delay_ms, max_delay_ms, batch_size, batch_pause_ms, daily_limit, max_per_minute, warmup_enabled, warmup_start_date, enabled",
    )
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (!row) return { ...DEFAULT_CAMPAIGN_CONFIG };
  return {
    min_delay_ms: row.min_delay_ms ?? DEFAULT_CAMPAIGN_CONFIG.min_delay_ms,
    max_delay_ms: row.max_delay_ms ?? DEFAULT_CAMPAIGN_CONFIG.max_delay_ms,
    batch_size: row.batch_size ?? DEFAULT_CAMPAIGN_CONFIG.batch_size,
    batch_pause_ms: row.batch_pause_ms ?? DEFAULT_CAMPAIGN_CONFIG.batch_pause_ms,
    daily_limit: row.daily_limit ?? DEFAULT_CAMPAIGN_CONFIG.daily_limit,
    max_per_minute: row.max_per_minute ?? DEFAULT_CAMPAIGN_CONFIG.max_per_minute,
    warmup_enabled: row.warmup_enabled ?? DEFAULT_CAMPAIGN_CONFIG.warmup_enabled,
    warmup_start_date: row.warmup_start_date ?? DEFAULT_CAMPAIGN_CONFIG.warmup_start_date,
    enabled: row.enabled ?? DEFAULT_CAMPAIGN_CONFIG.enabled,
  };
}

/** Retorna sent_count do dia (yyyy-mm-dd UTC), 0 se ainda sem linha. */
export async function loadCampaignDailyUsage(
  supabase: any,
  empresaId: string,
  now: Date = new Date(),
): Promise<{ usageDate: string; sentCount: number }> {
  const usageDate = now.toISOString().split("T")[0];
  const { data } = await supabase
    .from("orbit_whatsapp_daily_usage")
    .select("sent_count")
    .eq("empresa_id", empresaId)
    .eq("usage_date", usageDate)
    .maybeSingle();
  return { usageDate, sentCount: data?.sent_count ?? 0 };
}
