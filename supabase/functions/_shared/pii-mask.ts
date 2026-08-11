/**
 * Masking de PII para PREVIEWS (orbit_conversas.ultima_mensagem_preview).
 *
 * Regras:
 *  • NUNCA altera o corpo original em orbit_mensagens — este helper é usado
 *    apenas para o texto curto exibido em listas/inbox.
 *  • Preserva o texto conversacional útil: só o trecho sensível é mascarado.
 *  • Determinístico e sem dependências externas (roda no worker e no webhook).
 */

export const PII_MASK = "***";

/** CPF: 000.000.000-00 ou 00000000000 */
const RE_CPF = /(?<!\d)(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/g;
/** CNPJ: 00.000.000/0000-00 ou 00000000000000 */
const RE_CNPJ = /(?<!\d)(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})(?!\d)/g;
/** E-mail */
const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** CEP: 00000-000 / 00000000 (precedido opcionalmente por "CEP") */
const RE_CEP = /(?<!\d)(\d{5}-?\d{3})(?!\d)/g;
/** Telefone BR com DDD, com ou sem +55, separadores livres. */
const RE_PHONE =
  /(?<!\d)(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?9?\d{4}[\s.-]?\d{4}(?!\d)/g;
/** Número de logradouro após palavra de endereço (rua, av, etc). */
const RE_ADDRESS_NUMBER =
  /\b(rua|r\.|av|av\.|avenida|alameda|travessa|rodovia|estrada|praça|praca)\b([^,\n]{0,60}?)(,?\s*(?:n[ºo°.]?\s*)?)(\d{1,6})\b/gi;

/**
 * Mascara PII de um texto livre, preservando o restante.
 */
export function maskPii(input: string | null | undefined): string {
  let text = String(input ?? "");
  if (!text) return "";

  // Ordem importa: documentos longos antes de telefone/CEP para não fatiar dígitos.
  text = text.replace(RE_EMAIL, PII_MASK);
  text = text.replace(RE_CNPJ, PII_MASK);
  text = text.replace(RE_CPF, PII_MASK);
  text = text.replace(RE_ADDRESS_NUMBER, (_m, via, middle, sep) => `${via}${middle}${sep}${PII_MASK}`);
  text = text.replace(RE_CEP, PII_MASK);
  text = text.replace(RE_PHONE, PII_MASK);

  return text;
}

/** Mascara e trunca para uso direto em preview. */
export function maskPreview(input: string | null | undefined, maxChars = 100): string {
  return maskPii(input).replace(/\s+/g, " ").trim().slice(0, maxChars);
}
