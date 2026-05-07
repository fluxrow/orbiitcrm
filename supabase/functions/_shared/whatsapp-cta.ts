// Shared helper to render WhatsApp CTA button HTML in campaign emails.
// Resolves config from campaign override → template, normalizes phone, builds wa.me link.

export interface WhatsAppCtaConfig {
  enabled: boolean;
  numero: string;
  texto: string;
  mensagemInicial: string;
  posicao: "topo" | "rodape" | "ambos";
}

interface RawCfg {
  whatsapp_cta_override?: boolean | null;
  whatsapp_cta_enabled?: boolean | null;
  whatsapp_cta_numero?: string | null;
  whatsapp_cta_texto_botao?: string | null;
  whatsapp_cta_mensagem_inicial?: string | null;
  whatsapp_cta_posicao?: string | null;
}

export function resolveCtaConfig(
  campaign: RawCfg | null | undefined,
  template: RawCfg | null | undefined,
  defaultNumero?: string | null,
): WhatsAppCtaConfig | null {
  const useCampaign = !!campaign?.whatsapp_cta_override;
  const src = useCampaign ? campaign : template;
  if (!src?.whatsapp_cta_enabled) return null;
  const numero = normalizePhone(src.whatsapp_cta_numero || defaultNumero || "");
  if (!numero) return null;
  const posicao = (["topo", "rodape", "ambos"].includes(src.whatsapp_cta_posicao || "")
    ? src.whatsapp_cta_posicao
    : "rodape") as WhatsAppCtaConfig["posicao"];
  return {
    enabled: true,
    numero,
    texto: (src.whatsapp_cta_texto_botao || "Falar no WhatsApp").trim(),
    mensagemInicial: src.whatsapp_cta_mensagem_inicial || "",
    posicao,
  };
}

export function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  // If looks like Brazilian local (10/11 digits), prepend 55
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

export function applyVariables(text: string, vars: Record<string, string>): string {
  let out = text || "";
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(k, "g"), v ?? "");
  }
  return out;
}

export function buildCtaButtonHtml(
  cfg: WhatsAppCtaConfig,
  vars: Record<string, string>,
  trackedHref: (rawHref: string) => string,
): string {
  const msg = applyVariables(cfg.mensagemInicial || "", vars);
  const href = `https://wa.me/${cfg.numero}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;
  const finalHref = trackedHref(href);
  const label = cfg.texto || "Falar no WhatsApp";
  return `<table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto;border-collapse:collapse">
  <tr><td align="center" bgcolor="#25D366" style="border-radius:28px;background:#25D366">
    <a href="${finalHref}" target="_blank" style="display:inline-block;padding:14px 28px;font:600 16px/1 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:28px;">
      <span style="display:inline-block;vertical-align:middle">💬&nbsp;${escapeHtml(label)}</span>
    </a>
  </td></tr>
</table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function injectCta(html: string, ctaHtml: string, posicao: WhatsAppCtaConfig["posicao"]): string {
  if (posicao === "topo") return ctaHtml + html;
  if (posicao === "ambos") return ctaHtml + html + ctaHtml;
  return html + ctaHtml; // rodape
}
