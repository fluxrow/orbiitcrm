/**
 * Documento unificado (CPF/CNPJ) — biblioteca cliente.
 * Autodetecta tipo pelo número de dígitos: 11 = CPF (PF), 14 = CNPJ (PJ).
 */

import { validateCnpjDv } from "./cnpj";

export type TipoDocumento = "PF" | "PJ";

export function normalizeDocumento(value: string | null | undefined): string {
  return (value || "").replace(/[^0-9]/g, "");
}

export function detectTipoDocumento(value: string | null | undefined): TipoDocumento | null {
  const d = normalizeDocumento(value);
  if (d.length === 11) return "PF";
  if (d.length === 14) return "PJ";
  return null;
}

export function formatCpf(value: string): string {
  const d = normalizeDocumento(value);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function formatCnpj(value: string): string {
  const d = normalizeDocumento(value);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

/** Formata auto-detectando: CPF se ≤11 dígitos, CNPJ se >11. */
export function formatDocumento(value: string | null | undefined): string {
  const d = normalizeDocumento(value);
  if (d.length === 0) return "";
  if (d.length <= 11) return formatCpf(d);
  return formatCnpj(d);
}

export function validateCpfDv(cpf: string): boolean {
  const d = normalizeDocumento(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let dv = (sum * 10) % 11;
  if (dv === 10) dv = 0;
  if (dv !== parseInt(d[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  dv = (sum * 10) % 11;
  if (dv === 10) dv = 0;
  return dv === parseInt(d[10]);
}

export interface DocumentoValidation {
  valid: boolean;
  tipo: TipoDocumento | null;
  normalized: string;
  error?: "invalid_length" | "invalid_dv" | "repeated_digits";
}

export function validateDocumento(value: string | null | undefined): DocumentoValidation {
  const normalized = normalizeDocumento(value);
  if (normalized.length === 0) {
    return { valid: false, tipo: null, normalized, error: "invalid_length" };
  }
  const tipo = detectTipoDocumento(normalized);
  if (!tipo) {
    return { valid: false, tipo: null, normalized, error: "invalid_length" };
  }
  if (/^(\d)\1+$/.test(normalized)) {
    return { valid: false, tipo, normalized, error: "repeated_digits" };
  }
  const ok = tipo === "PF" ? validateCpfDv(normalized) : validateCnpjDv(normalized);
  return ok
    ? { valid: true, tipo, normalized }
    : { valid: false, tipo, normalized, error: "invalid_dv" };
}

/** Label legível: "CPF" | "CNPJ" | "Documento". */
export function tipoDocumentoLabel(tipo: TipoDocumento | null | undefined): string {
  if (tipo === "PF") return "CPF";
  if (tipo === "PJ") return "CNPJ";
  return "Documento";
}
