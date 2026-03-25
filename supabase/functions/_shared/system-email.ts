/**
 * System-level email config for platform emails (trial, invite, activation, welcome).
 * NEVER uses tenant branding — always "Orbit".
 *
 * For tenant-scoped emails (campaigns, 1:1), use orbit-send-email which reads
 * orbit_resend_config per empresa_id.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SYSTEM_FROM_NAME = "Orbit CRM";
const SYSTEM_FROM_EMAIL = "orbit@fluxrow.pro";

export interface SystemEmailConfig {
  apiKey: string | null;
  fromEmail: string;
}

/**
 * Resolves the Resend API key from global config (api_key only) or env var.
 * Always returns "Orbit <onboarding@resend.dev>" as sender — ignores
 * from_name/from_email in orbit_resend_config to prevent tenant branding leaks.
 */
export async function getSystemEmailConfig(
  supabase: ReturnType<typeof createClient>,
): Promise<SystemEmailConfig> {
  // 1) Dedicated PE Admin key
  let apiKey: string | null = Deno.env.get("PE_RESEND_API_KEY") || null;

  // 2) Global orbit_resend_config (api_key only)
  if (!apiKey) {
    try {
      const { data: cfg } = await supabase
        .from("orbit_resend_config")
        .select("api_key")
        .is("empresa_id", null)
        .maybeSingle();

      if (cfg?.api_key) apiKey = cfg.api_key;
    } catch (_e) {
      /* ignore — fall through to env var */
    }
  }

  // 3) General fallback
  if (!apiKey) apiKey = Deno.env.get("RESEND_API_KEY") || null;

  return {
    apiKey,
    fromEmail: `${SYSTEM_FROM_NAME} <${SYSTEM_FROM_EMAIL}>`,
  };
}
