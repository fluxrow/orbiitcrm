import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { usePeAuth } from "./usePeAuth";
import { toast } from "sonner";

export interface ImportReport {
  clientes_criados: number;
  clientes_atualizados: number;
  contatos_criados: number;
  duplicados_evitados: number;
  erros: { row: number; message: string }[];
}

interface ParsedRow {
  razao_social: string;
  nome_fantasia?: string;
  cnpj?: string;
  site?: string;
  cidade?: string;
  uf?: string;
  porte?: string;
  segmento_macro?: string;
  contato_nome?: string;
  contato_email?: string;
  contato_telefone?: string;
  contato_whatsapp?: string;
  contato_cargo?: string;
  contato_decisor?: boolean;
}

function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

function extractDomain(email: string): string | null {
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const domain = parts[1].toLowerCase();
  if (["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br", "uol.com.br", "bol.com.br", "terra.com.br", "ig.com.br"].includes(domain)) {
    return null; // free email providers → not useful for dedupe
  }
  return domain;
}

function detectSeparator(line: string): string {
  return (line.match(/;/g) || []).length > (line.match(/,/g) || []).length ? ";" : ",";
}

function parseCSVLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === sep && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += char; }
  }
  result.push(current.trim());
  return result;
}

const COLUMN_MAP: Record<string, keyof ParsedRow> = {
  razao_social: "razao_social", nome: "razao_social", "razao social": "razao_social",
  nome_fantasia: "nome_fantasia", fantasia: "nome_fantasia",
  cnpj: "cnpj", documento: "cnpj",
  site: "site", website: "site", url: "site",
  cidade: "cidade", uf: "uf", estado: "uf",
  porte: "porte",
  segmento: "segmento_macro", segmento_macro: "segmento_macro", setor: "segmento_macro",
  contato: "contato_nome", contato_nome: "contato_nome", "nome contato": "contato_nome",
  email: "contato_email", contato_email: "contato_email",
  telefone: "contato_telefone", contato_telefone: "contato_telefone",
  whatsapp: "contato_whatsapp", contato_whatsapp: "contato_whatsapp", celular: "contato_whatsapp",
  cargo: "contato_cargo", contato_cargo: "contato_cargo",
  decisor: "contato_decisor", contato_decisor: "contato_decisor",
};

export function parseImportCSV(csvText: string): { rows: ParsedRow[]; errors: { row: number; message: string }[] } {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], errors: [{ row: 0, message: "Arquivo vazio" }] };

  const sep = detectSeparator(lines[0]);
  const headers = parseCSVLine(lines[0], sep).map(h =>
    h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_ ]/g, "").trim()
  );

  const rows: ParsedRow[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseCSVLine(lines[i], sep);
    const row: Partial<ParsedRow> = {};

    headers.forEach((h, idx) => {
      const key = COLUMN_MAP[h];
      if (key && vals[idx]) {
        const v = vals[idx].replace(/^["']|["']$/g, "").trim();
        if (key === "contato_decisor") {
          (row as any)[key] = ["sim", "s", "true", "1", "yes"].includes(v.toLowerCase());
        } else {
          (row as any)[key] = v;
        }
      }
    });

    if (!row.razao_social) { errors.push({ row: i + 1, message: "Razão Social obrigatória" }); continue; }
    rows.push(row as ParsedRow);
  }

  return { rows, errors };
}

export function useImportClientes() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { orgId } = usePeAuth();

  return useMutation({
    mutationFn: async ({ rows, origemId }: { rows: ParsedRow[]; origemId?: string }): Promise<ImportReport> => {
      if (!user?.id || !orgId) throw new Error("Usuário ou organização não encontrada");

      const report: ImportReport = { clientes_criados: 0, clientes_atualizados: 0, contatos_criados: 0, duplicados_evitados: 0, erros: [] };

      // Pre-fetch existing for dedupe
      const { data: existingClientes } = await supabase
        .from("clientes" as any).select("id, cnpj, dominio_principal, razao_social_normalizada, cidade, uf")
        .eq("organization_id", orgId);
      const { data: existingContatos } = await supabase
        .from("contatos" as any).select("id, email_normalizado, cliente_id")
        .eq("organization_id", orgId);

      const cnpjMap = new Map<string, any>();
      const domainMap = new Map<string, any>();
      const nameMap = new Map<string, any>();
      (existingClientes || []).forEach((c: any) => {
        if (c.cnpj) cnpjMap.set(c.cnpj.replace(/\D/g, ""), c);
        if (c.dominio_principal) domainMap.set(c.dominio_principal, c);
        const key = `${c.razao_social_normalizada}|${c.cidade || ""}|${c.uf || ""}`;
        nameMap.set(key, c);
      });

      const emailSet = new Set((existingContatos || []).map((c: any) => c.email_normalizado).filter(Boolean));

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const razaoNorm = normalizeText(row.razao_social);
          const cnpjClean = row.cnpj?.replace(/\D/g, "") || null;
          const emailNorm = row.contato_email?.toLowerCase().trim() || null;
          const domain = emailNorm ? extractDomain(emailNorm) : (row.site ? row.site.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : null);

          // === DEDUPE CLIENTE ===
          let cliente: any = null;

          // Rule 1: CNPJ
          if (cnpjClean && cnpjMap.has(cnpjClean)) {
            cliente = cnpjMap.get(cnpjClean);
            // update empty fields
            const updates: any = {};
            if (!cliente.dominio_principal && domain) updates.dominio_principal = domain;
            if (Object.keys(updates).length > 0) {
              await supabase.from("clientes" as any).update(updates).eq("id", cliente.id);
              report.clientes_atualizados++;
            } else {
              report.duplicados_evitados++;
            }
          }
          // Rule 2: Domain
          else if (!cnpjClean && domain && domainMap.has(domain)) {
            cliente = domainMap.get(domain);
            report.duplicados_evitados++;
          }
          // Rule 3: Normalized name + city + uf
          else {
            const nameKey = `${razaoNorm}|${row.cidade || ""}|${row.uf || ""}`;
            if (nameMap.has(nameKey)) {
              cliente = nameMap.get(nameKey);
              report.duplicados_evitados++;
            }
          }

          // Create new client if no match
          if (!cliente) {
            const { data: newCliente, error } = await supabase.from("clientes" as any).insert({
              organization_id: orgId,
              razao_social: row.razao_social,
              nome_fantasia: row.nome_fantasia || null,
              cnpj: row.cnpj || null,
              site: row.site || null,
              razao_social_normalizada: razaoNorm,
              dominio_principal: domain || null,
              porte: row.porte || null,
              cidade: row.cidade || null,
              uf: row.uf || null,
            }).select().single();

            if (error) { report.erros.push({ row: i + 2, message: error.message }); continue; }
            cliente = newCliente;
            report.clientes_criados++;

            // Update maps
            if (cnpjClean) cnpjMap.set(cnpjClean, cliente);
            if (domain) domainMap.set(domain, cliente);
            nameMap.set(`${razaoNorm}|${row.cidade || ""}|${row.uf || ""}`, cliente);
          }

          // Link origem if provided
          if (origemId && cliente) {
            await supabase.from("cliente_origem" as any).upsert({
              organization_id: orgId,
              cliente_id: cliente.id,
              origem_id: origemId,
              data_importacao: new Date().toISOString(),
            }, { onConflict: "organization_id,cliente_id,origem_id" as any });
          }

          // === CONTATO ===
          if (row.contato_nome && emailNorm) {
            if (emailSet.has(emailNorm)) {
              report.duplicados_evitados++;
            } else {
              const { error: cErr } = await supabase.from("contatos" as any).insert({
                organization_id: orgId,
                cliente_id: cliente.id,
                nome: row.contato_nome,
                cargo: row.contato_cargo || null,
                email: row.contato_email,
                email_normalizado: emailNorm,
                telefone: row.contato_telefone || null,
                whatsapp: row.contato_whatsapp || null,
                decisor: row.contato_decisor || false,
              });
              if (cErr) {
                report.erros.push({ row: i + 2, message: `Contato: ${cErr.message}` });
              } else {
                report.contatos_criados++;
                emailSet.add(emailNorm);
              }
            }
          } else if (row.contato_nome) {
            // contato without email - just create
            const { error: cErr } = await supabase.from("contatos" as any).insert({
              organization_id: orgId,
              cliente_id: cliente.id,
              nome: row.contato_nome,
              cargo: row.contato_cargo || null,
              telefone: row.contato_telefone || null,
              whatsapp: row.contato_whatsapp || null,
              decisor: row.contato_decisor || false,
            });
            if (!cErr) report.contatos_criados++;
          }
        } catch (err: any) {
          report.erros.push({ row: i + 2, message: err.message });
        }
      }

      // Audit log
      await supabase.from("pe_audit_log" as any).insert({
        organization_id: orgId,
        actor_user_id: user.id,
        action: "IMPORT_BATCH_COMPLETED",
        entity_type: "import",
        metadata: {
          clientes_criados: report.clientes_criados,
          clientes_atualizados: report.clientes_atualizados,
          contatos_criados: report.contatos_criados,
          duplicados_evitados: report.duplicados_evitados,
          total_rows: rows.length,
        },
      });

      return report;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["contatos"] });
      qc.invalidateQueries({ queryKey: ["cliente_origem"] });
    },
  });
}
