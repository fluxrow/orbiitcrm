/**
 * F2 — Importador Inteligente de CSV
 * Wizard com mapeamento manual + JSONB dinâmico + bulk insert por lotes + upsert.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orbitProspectKeys } from "@/lib/query-keys";
import { normalizeDocumento, detectTipoDocumento, validateDocumento } from "@/lib/documento";

const stripDiacritics = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export type SystemField =
  | "nome_razao"
  | "nome_fantasia"
  | "nome_contato"
  | "email_principal"
  | "telefone"
  | "whatsapp"
  | "documento"
  | "cidade"
  | "estado"
  | "segmento"
  | "origem_lead"
  | "observacoes"
  | "tags"
  | "__extra__"
  | "__ignore__";

export const SYSTEM_FIELD_OPTIONS: { value: SystemField; label: string; group: string }[] = [
  { value: "nome_razao", label: "Nome / Razão Social", group: "Identificação" },
  { value: "nome_fantasia", label: "Nome Fantasia", group: "Identificação" },
  { value: "nome_contato", label: "Nome do Contato", group: "Identificação" },
  { value: "documento", label: "Documento (CPF/CNPJ)", group: "Identificação" },
  { value: "email_principal", label: "E-mail", group: "Contato" },
  { value: "telefone", label: "Telefone", group: "Contato" },
  { value: "whatsapp", label: "WhatsApp", group: "Contato" },
  { value: "cidade", label: "Cidade", group: "Localização" },
  { value: "estado", label: "Estado/UF", group: "Localização" },
  { value: "segmento", label: "Segmento", group: "Comercial" },
  { value: "origem_lead", label: "Origem do Lead", group: "Comercial" },
  { value: "observacoes", label: "Observações", group: "Comercial" },
  { value: "tags", label: "Tags", group: "Comercial" },
  { value: "__extra__", label: "→ Campo Extra (JSONB)", group: "Especial" },
  { value: "__ignore__", label: "Ignorar coluna", group: "Especial" },
];

const AUTO_MAP: Record<string, SystemField> = {
  "nome": "nome_razao",
  "nome da empresa": "nome_razao",
  "razao social": "nome_razao",
  "razão social": "nome_razao",
  "empresa": "nome_razao",
  "nome fantasia": "nome_fantasia",
  "fantasia": "nome_fantasia",
  "contato": "nome_contato",
  "nome do contato": "nome_contato",
  "responsavel": "nome_contato",
  "cnpj": "documento",
  "cpf": "documento",
  "cnpj/cpf": "documento",
  "documento": "documento",
  "doc": "documento",
  "email": "email_principal",
  "e-mail": "email_principal",
  "email principal": "email_principal",
  "mail": "email_principal",
  "telefone": "telefone",
  "fone": "telefone",
  "celular": "telefone",
  "whatsapp": "whatsapp",
  "wpp": "whatsapp",
  "zap": "whatsapp",
  "cidade": "cidade",
  "municipio": "cidade",
  "município": "cidade",
  "estado": "estado",
  "uf": "estado",
  "segmento": "segmento",
  "nicho": "segmento",
  "origem": "origem_lead",
  "origem do lead": "origem_lead",
  "observacoes": "observacoes",
  "observações": "observacoes",
  "obs": "observacoes",
  "tags": "tags",
};

function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === sep) { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export interface CsvParsed {
  headers: string[];
  rows: string[][];
  separator: string;
  autoMapping: SystemField[];
}

export function parseCsvFile(text: string): CsvParsed {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [], separator: ",", autoMapping: [] };
  const first = lines[0];
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = parseCsvLine(first, sep);
  const rows = lines.slice(1).map(l => parseCsvLine(l, sep));
  const autoMapping = headers.map(h => AUTO_MAP[stripDiacritics(h)] ?? "__extra__");
  return { headers, rows, separator: sep, autoMapping };
}

const normEmail = (v?: string | null) => (v || "").toLowerCase().trim() || null;
const normPhone = (v?: string | null) => {
  const digits = (v || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
};

function slugify(s: string): string {
  return stripDiacritics(s)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "import";
}

export function buildRecordsFromMapping(
  headers: string[],
  rows: string[][],
  mapping: SystemField[],
): { records: any[]; rowErrors: { row: number; message: string }[] } {
  const rowErrors: { row: number; message: string }[] = [];
  const records: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    const rec: any = { dados_adicionais: {} };
    let docError: string | null = null;

    for (let c = 0; c < headers.length; c++) {
      const target = mapping[c];
      const val = (cells[c] || "").trim();
      if (!val || target === "__ignore__") continue;

      if (target === "__extra__") {
        rec.dados_adicionais[headers[c]] = val;
        continue;
      }
      if (target === "documento") {
        const v = validateDocumento(val);
        if (!v.valid) { docError = `Documento inválido: "${val}"`; continue; }
        rec.cnpj_cpf = v.normalized;
        rec.tipo_documento = v.tipo;
        continue;
      }
      if (target === "tags") {
        rec.tags = val.split(/[;,|]/).map(t => t.trim()).filter(Boolean);
        continue;
      }
      if (target === "email_principal") {
        rec.email_principal = normEmail(val);
        continue;
      }
      rec[target] = val;
    }

    // Sanity
    if (!rec.nome_razao && !rec.nome_fantasia && !rec.email_principal && !rec.telefone && !rec.whatsapp && !rec.cnpj_cpf) {
      rowErrors.push({ row: i + 2, message: "Linha sem identificador (nome, email, telefone ou documento)" });
      continue;
    }
    if (docError) rowErrors.push({ row: i + 2, message: docError });
    if (!rec.nome_razao) rec.nome_razao = rec.nome_fantasia || rec.nome_contato || rec.email_principal || "(sem nome)";

    records.push(rec);
  }
  return { records, rowErrors };
}

export interface ImportProgress {
  phase: "preparing" | "dedup" | "inserting" | "updating" | "done";
  current: number;
  total: number;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  invalid: number;
  errors: string[];
  listaTag: string;
}

export function useImportProspectsWizard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      records,
      empresaId,
      fileName,
      mergeMode = true,
      onProgress,
    }: {
      records: any[];
      empresaId: string;
      fileName: string;
      mergeMode?: boolean;
      onProgress?: (p: ImportProgress) => void;
    }): Promise<ImportResult> => {
      if (!records.length) throw new Error("Nenhum registro para importar");

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
      const listaTag = `lista:${slugify(fileName)}-${stamp}`;

      onProgress?.({ phase: "preparing", current: 0, total: records.length });

      // 1) Dedupe intra-arquivo (email + phone + documento)
      const seenEmail = new Set<string>();
      const seenPhone = new Set<string>();
      const seenDoc = new Set<string>();
      let intraDupes = 0;
      const fileDedup = records.filter(r => {
        const e = normEmail(r.email_principal);
        const p = normPhone(r.telefone) || normPhone(r.whatsapp);
        const d = normalizeDocumento(r.cnpj_cpf);
        if (e && seenEmail.has(e)) { intraDupes++; return false; }
        if (p && seenPhone.has(p)) { intraDupes++; return false; }
        if (d && seenDoc.has(d)) { intraDupes++; return false; }
        if (e) seenEmail.add(e);
        if (p) seenPhone.add(p);
        if (d) seenDoc.add(d);
        return true;
      });

      // 2) Buscar existentes
      onProgress?.({ phase: "dedup", current: 0, total: fileDedup.length });
      const SELECT_FIELDS = "id, nome_razao, nome_fantasia, cnpj_cpf, email_principal, telefone, whatsapp, cidade, estado, segmento, origem_lead, observacoes, tags, nome_contato, dados_adicionais, tipo_documento";

      const emails = Array.from(seenEmail);
      const docs = Array.from(seenDoc);
      const existingByEmail = new Map<string, any>();
      const existingByPhone = new Map<string, any>();
      const existingByDoc = new Map<string, any>();

      if (emails.length) {
        const { data } = await supabase
          .from("orbit_prospects")
          .select(SELECT_FIELDS)
          .eq("empresa_id", empresaId)
          .in("email_principal", emails);
        (data || []).forEach((r: any) => {
          const e = normEmail(r.email_principal);
          if (e) existingByEmail.set(e, r);
        });
      }
      if (docs.length) {
        const { data } = await supabase
          .from("orbit_prospects")
          .select(SELECT_FIELDS)
          .eq("empresa_id", empresaId)
          .in("cnpj_cpf", docs);
        (data || []).forEach((r: any) => {
          const d = normalizeDocumento(r.cnpj_cpf);
          if (d) existingByDoc.set(d, r);
        });
      }
      const { data: phoneRows } = await supabase
        .from("orbit_prospects")
        .select(SELECT_FIELDS)
        .eq("empresa_id", empresaId)
        .or("telefone.not.is.null,whatsapp.not.is.null");
      (phoneRows || []).forEach((r: any) => {
        const p1 = normPhone(r.telefone);
        const p2 = normPhone(r.whatsapp);
        if (p1 && !existingByPhone.has(p1)) existingByPhone.set(p1, r);
        if (p2 && !existingByPhone.has(p2)) existingByPhone.set(p2, r);
      });

      // 3) Split
      const toInsert: any[] = [];
      const toMerge: { existing: any; row: any }[] = [];
      let skipped = intraDupes;

      for (const r of fileDedup) {
        const e = normEmail(r.email_principal);
        const p = normPhone(r.telefone) || normPhone(r.whatsapp);
        const d = normalizeDocumento(r.cnpj_cpf);
        const existing =
          (e && existingByEmail.get(e)) ||
          (d && existingByDoc.get(d)) ||
          (p && existingByPhone.get(p)) || null;
        if (existing) {
          if (mergeMode) toMerge.push({ existing, row: r });
          else skipped++;
        } else {
          toInsert.push(r);
        }
      }

      const errors: string[] = [];
      let inserted = 0;
      let updated = 0;

      // 4) Bulk insert em lotes de 500
      const insertPayload = toInsert.map(r => {
        const baseTags: string[] = Array.isArray(r.tags) ? r.tags : [];
        const tags = Array.from(new Set([...baseTags, listaTag]));
        return {
          empresa_id: empresaId,
          origem_contato: "IMPORTACAO",
          tipo: r.cnpj_cpf && r.tipo_documento === "PF" ? "pessoa" : "empresa",
          nome_razao: r.nome_razao,
          nome_fantasia: r.nome_fantasia || null,
          nome_contato: r.nome_contato || null,
          cnpj_cpf: r.cnpj_cpf || null,
          tipo_documento: r.tipo_documento || null,
          email_principal: r.email_principal || null,
          telefone: r.telefone || null,
          whatsapp: r.whatsapp || null,
          cidade: r.cidade || null,
          estado: r.estado || null,
          segmento: r.segmento || null,
          origem_lead: r.origem_lead || null,
          observacoes: r.observacoes || null,
          tags,
          dados_adicionais: r.dados_adicionais || {},
          status_qualificacao: "novo",
        };
      });

      const BATCH = 500;
      for (let i = 0; i < insertPayload.length; i += BATCH) {
        const batch = insertPayload.slice(i, i + BATCH);
        const { error, count } = await supabase
          .from("orbit_prospects")
          .insert(batch as any, { count: "exact" });
        if (error) errors.push(`Lote ${i / BATCH + 1}: ${error.message}`);
        else inserted += count ?? batch.length;
        onProgress?.({ phase: "inserting", current: Math.min(i + BATCH, insertPayload.length), total: insertPayload.length });
      }

      // 5) Merge (upsert por linha — only fills empty fields, merges dados_adicionais, adiciona listaTag)
      const fillableFields = [
        "nome_razao", "nome_fantasia", "cnpj_cpf", "tipo_documento", "email_principal",
        "telefone", "whatsapp", "cidade", "estado", "segmento", "origem_lead",
        "observacoes", "nome_contato",
      ];
      let mergeIdx = 0;
      for (const { existing, row } of toMerge) {
        mergeIdx++;
        const patch: Record<string, any> = {};
        for (const f of fillableFields) {
          const incoming = row[f];
          const cur = existing[f];
          if (incoming && (cur === null || cur === undefined || cur === "")) {
            patch[f] = incoming;
          }
        }
        // dados_adicionais merge (incoming overrides only keys it brings)
        const incomingExtra = row.dados_adicionais || {};
        if (Object.keys(incomingExtra).length > 0) {
          const cur = (existing.dados_adicionais && typeof existing.dados_adicionais === "object") ? existing.dados_adicionais : {};
          patch.dados_adicionais = { ...cur, ...incomingExtra };
        }
        // tags
        const incomingTags: string[] = Array.isArray(row.tags) ? row.tags : [];
        const existingTags: string[] = Array.isArray(existing.tags) ? existing.tags : [];
        const mergedTags = Array.from(new Set([...existingTags, ...incomingTags, listaTag]));
        if (mergedTags.length > existingTags.length) patch.tags = mergedTags;

        if (Object.keys(patch).length === 0) continue;
        const { error } = await supabase
          .from("orbit_prospects")
          .update(patch as any)
          .eq("id", existing.id)
          .eq("empresa_id", empresaId);
        if (error) errors.push(`Update ${existing.id}: ${error.message}`);
        else updated++;
        if (mergeIdx % 20 === 0 || mergeIdx === toMerge.length) {
          onProgress?.({ phase: "updating", current: mergeIdx, total: toMerge.length });
        }
      }

      // 6) History
      try {
        await supabase.from("orbit_import_history").insert({
          empresa_id: empresaId,
          arquivo_nome: fileName,
          total_registros: records.length,
          sucesso: inserted + updated,
          erros: errors.length,
          detalhes_erros: errors.slice(0, 50),
        });
      } catch { /* non-blocking */ }

      onProgress?.({ phase: "done", current: records.length, total: records.length });
      return { inserted, updated, skipped, invalid: 0, errors, listaTag };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orbitProspectKeys.all });
    },
  });
}
