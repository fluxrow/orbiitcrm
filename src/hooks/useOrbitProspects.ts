import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { orbitProspectKeys } from "@/lib/query-keys";
import { useTenant } from "@/contexts/TenantContext";
import { pickUpdate } from "@/lib/supabase-update";


type Prospect = Tables<"orbit_prospects">;
type ProspectInsert = TablesInsert<"orbit_prospects">;
type ProspectUpdate = TablesUpdate<"orbit_prospects">;

interface ProspectFilters {
  search?: string;
  status_qualificacao?: string;
  origem_contato?: string;
  responsavel_id?: string;
}

export function useOrbitProspectsCount() {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: [...orbitProspectKeys.count(), empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orbit_prospects")
        .select("*", { count: "exact", head: true })
        .eq("empresa_id", empresaId!)
        .is("deleted_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}


export function useOrbitProspects(filters?: ProspectFilters) {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: [...orbitProspectKeys.list(filters), empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const trimmedSearch = filters?.search?.trim();
      let query = supabase
        .from("orbit_prospects")
        .select("*, responsavel:profiles!orbit_prospects_responsavel_id_fkey(id, nome, email)")
        .eq("empresa_id", empresaId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });


      if (trimmedSearch) {
        query = query.textSearch("search_vector", trimmedSearch, {
          type: "websearch",
          config: "portuguese",
        });
      }

      if (filters?.status_qualificacao && filters.status_qualificacao !== "all") {
        query = query.eq("status_qualificacao", filters.status_qualificacao);
      }

      if (filters?.origem_contato && filters.origem_contato !== "all") {
        query = query.eq("origem_contato", filters.origem_contato);
      }

      if (filters?.responsavel_id) {
        query = query.eq("responsavel_id", filters.responsavel_id);
      }

      // Fetch all records using paginated loop to avoid 1000-row default limit
      const PAGE = 1000;
      let allData: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await query.range(from, from + PAGE - 1);
        if (error) throw error;
        allData = allData.concat(data || []);
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      return allData;
    },
  });
}

export function useOrbitProspect(id: string | undefined) {
  return useQuery({
    queryKey: id ? orbitProspectKeys.detail(id) : orbitProspectKeys.details(),
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("orbit_prospects")
        .select("*, responsavel:profiles!orbit_prospects_responsavel_id_fkey(id, nome, email)")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateProspect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prospect: ProspectInsert) => {
      // Server-side plan limit check
      if (prospect.empresa_id) {
        const { data: check } = await supabase.rpc("saas_can_use" as any, {
          p_empresa_id: prospect.empresa_id,
          p_feature_code: "prospect_add",
          p_amount: 1,
        });
        if (check && !(check as any).allowed) {
          const err = new Error((check as any).reason || "PLAN_LIMIT_REACHED");
          (err as any).code = (check as any).reason;
          throw err;
        }
      }

      const { data, error } = await supabase
        .from("orbit_prospects")
        .insert(prospect)
        .select()
        .single();
      if (error) throw error;

      // Auto-register lead_created event
      if (data.empresa_id) {
        await supabase.from("prospect_events" as any).insert({
          empresa_id: data.empresa_id,
          prospect_id: data.id,
          event_type: "lead_created",
          titulo: "Lead criado",
          descricao: `Prospect ${data.nome_razao} foi criado`,
        }).then(() => {});
      }

      // H2.a — Se já entra qualificado, garantir card no funil
      if (data.status_qualificacao === "qualificado") {
        try {
          await supabase.rpc("ensure_deal_for_prospect" as any, { _prospect_id: data.id });
        } catch (e) {
          console.warn("[useCreateProspect] ensure_deal_for_prospect falhou:", e);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orbitProspectKeys.all });
      queryClient.invalidateQueries({ queryKey: ["orbit-deals-grouped"] });
    },
  });
}

export function useUpdateProspect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: ProspectUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("orbit_prospects")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      // H2.a — promover para qualificado deve materializar card no funil
      if (data?.status_qualificacao === "qualificado") {
        try {
          await supabase.rpc("ensure_deal_for_prospect" as any, { _prospect_id: data.id });
        } catch (e) {
          console.warn("[useUpdateProspect] ensure_deal_for_prospect falhou:", e);
        }
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: orbitProspectKeys.all });
      queryClient.invalidateQueries({ queryKey: orbitProspectKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: ["orbit-deals-grouped"] });
    },
  });
}

export function useDeleteProspect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_prospects")
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orbitProspectKeys.all });
    },
  });
}

// ===== CSV Import =====

const stripDiacritics = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const PROSPECT_COLUMN_MAP: Record<string, string> = {
  "nome da empresa": "nome_razao",
  "razao social": "nome_razao",
  "nome": "nome_razao",
  "empresa": "nome_razao",
  "nome fantasia": "nome_fantasia",
  "cnpj": "cnpj_cpf",
  "cpf": "cnpj_cpf",
  "cnpj/cpf": "cnpj_cpf",
  "documento": "cnpj_cpf",
  "doc": "cnpj_cpf",
  "email": "email_principal",
  "e-mail": "email_principal",
  "email principal": "email_principal",
  "telefone": "telefone",
  "fone": "telefone",
  "whatsapp": "whatsapp",
  "wpp": "whatsapp",
  "cidade": "cidade",
  "estado": "estado",
  "uf": "estado",
  "segmento": "segmento",
  "origem": "origem_lead",
  "origem do lead": "origem_lead",
  "observacoes": "observacoes",
  "observacao": "observacoes",
  "obs": "observacoes",
  "tags": "tags",
  "nome do contato": "nome_contato",
  "contato": "nome_contato",
};

export type ParsedProspectRow = {
  nome_razao?: string;
  nome_fantasia?: string;
  cnpj_cpf?: string;
  email_principal?: string;
  telefone?: string;
  whatsapp?: string;
  cidade?: string;
  estado?: string;
  segmento?: string;
  origem_lead?: string;
  observacoes?: string;
  tags?: string;
  nome_contato?: string;
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

export function parseProspectsCSV(text: string): { rows: ParsedProspectRow[]; errors: { row: number; message: string }[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const errors: { row: number; message: string }[] = [];
  if (lines.length < 2) return { rows: [], errors: [{ row: 0, message: "Arquivo vazio ou sem dados" }] };

  const firstLine = lines[0];
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = parseCsvLine(firstLine, sep).map(stripDiacritics);
  const mapped = headers.map(h => PROSPECT_COLUMN_MAP[h] ?? null);

  const rows: ParsedProspectRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], sep);
    const row: any = {};
    mapped.forEach((key, idx) => {
      if (key && cells[idx]) row[key] = cells[idx];
    });
    if (!row.nome_razao && !row.email_principal && !row.telefone && !row.whatsapp) {
      errors.push({ row: i + 1, message: "Linha sem nome, email ou telefone" });
      continue;
    }
    rows.push(row);
  }
  return { rows, errors };
}

export function useImportProspectsCSV() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      rows, empresaId, mergeMode = false, fileName = "import.csv",
    }: {
      rows: ParsedProspectRow[];
      empresaId: string;
      mergeMode?: boolean;
      fileName?: string;
    }) => {
      if (!rows.length) throw new Error("Nenhum prospect para importar");

      // Generate a unique list tag based on the file name + timestamp
      const slugify = (s: string) =>
        stripDiacritics(s)
          .replace(/\.[^.]+$/, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60) || "import";
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
      const listaTag = `lista:${slugify(fileName)}-${stamp}`;

      const normEmail = (v?: string | null) => (v || "").toLowerCase().trim() || null;
      const normPhone = (v?: string | null) => {
        const digits = (v || "").replace(/\D/g, "");
        return digits.length >= 8 ? digits : null;
      };
      const isEmpty = (v: any) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

      // 1) Dedupe within file
      const seenEmail = new Set<string>();
      const seenPhone = new Set<string>();
      const fileDedup = rows.filter(r => {
        const e = normEmail(r.email_principal);
        const p = normPhone(r.telefone) || normPhone(r.whatsapp);
        if (e && seenEmail.has(e)) return false;
        if (p && seenPhone.has(p)) return false;
        if (e) seenEmail.add(e);
        if (p) seenPhone.add(p);
        return true;
      });

      // 2) Fetch existing
      const emails = Array.from(seenEmail);
      const existingByEmail = new Map<string, any>();
      const existingByPhone = new Map<string, any>();
      const FIELDS = "id, nome_razao, nome_fantasia, cnpj_cpf, email_principal, telefone, whatsapp, cidade, estado, segmento, origem_lead, observacoes, tags, nome_contato";

      if (emails.length) {
        const { data } = await supabase
          .from("orbit_prospects")
          .select(FIELDS)
          .eq("empresa_id", empresaId)
          .in("email_principal", emails);
        (data || []).forEach((r: any) => {
          const e = normEmail(r.email_principal);
          if (e) existingByEmail.set(e, r);
        });
      }
      // Fetch by phone (paged-safe: just pull non-null phone/whatsapp)
      const { data: phoneRows } = await supabase
        .from("orbit_prospects")
        .select(FIELDS)
        .eq("empresa_id", empresaId)
        .or("telefone.not.is.null,whatsapp.not.is.null");
      (phoneRows || []).forEach((r: any) => {
        const p1 = normPhone(r.telefone);
        const p2 = normPhone(r.whatsapp);
        if (p1) existingByPhone.set(p1, r);
        if (p2 && !existingByPhone.has(p2)) existingByPhone.set(p2, r);
      });

      // 3) Split
      const toInsert: ParsedProspectRow[] = [];
      const toMerge: { existing: any; row: ParsedProspectRow }[] = [];
      let skipped = rows.length - fileDedup.length;

      for (const r of fileDedup) {
        const e = normEmail(r.email_principal);
        const p = normPhone(r.telefone) || normPhone(r.whatsapp);
        const existing = (e && existingByEmail.get(e)) || (p && existingByPhone.get(p)) || null;
        if (existing) {
          if (mergeMode) toMerge.push({ existing, row: r });
          else skipped++;
        } else {
          toInsert.push(r);
        }
      }

      // 4) Inserts (batches of 500)
      const errors: string[] = [];
      let inserted = 0;
      const insertPayload = toInsert.map(r => ({
        empresa_id: empresaId,
        origem_contato: "IMPORTACAO",
        tipo: "empresa",
        nome_razao: r.nome_razao || r.nome_fantasia || "(sem nome)",
        nome_fantasia: r.nome_fantasia || null,
        cnpj_cpf: r.cnpj_cpf || null,
        email_principal: normEmail(r.email_principal),
        telefone: r.telefone || null,
        whatsapp: r.whatsapp || null,
        cidade: r.cidade || null,
        estado: r.estado || null,
        segmento: r.segmento || null,
        origem_lead: r.origem_lead || null,
        observacoes: r.observacoes || null,
        nome_contato: r.nome_contato || null,
        tags: (() => {
          const base = r.tags ? r.tags.split(/[;,|]/).map(t => t.trim()).filter(Boolean) : [];
          return Array.from(new Set([...base, listaTag]));
        })(),
        status_qualificacao: "novo",
      }));

      for (let i = 0; i < insertPayload.length; i += 500) {
        const batch = insertPayload.slice(i, i + 500);
        const { error, count } = await supabase
          .from("orbit_prospects")
          .insert(batch, { count: "exact" });
        if (error) errors.push(error.message);
        else inserted += count ?? batch.length;
      }

      // 5) Merge
      let updated = 0;
      let mergedUntouched = 0;
      const mergeFields: (keyof ParsedProspectRow)[] = [
        "nome_razao", "nome_fantasia", "cnpj_cpf", "email_principal", "telefone",
        "whatsapp", "cidade", "estado", "segmento", "origem_lead", "observacoes", "nome_contato",
      ];
      for (const { existing, row } of toMerge) {
        const patch: Record<string, any> = {};
        for (const f of mergeFields) {
          const incoming = f === "email_principal" ? normEmail(row.email_principal) : ((row as any)[f] || null);
          if (!isEmpty(incoming) && isEmpty(existing[f])) {
            patch[f] = incoming;
          }
        }
        // merge tags (always add the lista tag, plus any incoming tags from CSV)
        {
          const incomingTags = row.tags ? row.tags.split(/[;,|]/).map(t => t.trim()).filter(Boolean) : [];
          const existingTags: string[] = Array.isArray(existing.tags) ? existing.tags : [];
          const merged = Array.from(new Set([...existingTags, ...incomingTags, listaTag]));
          if (merged.length > existingTags.length) patch.tags = merged;
        }
        if (Object.keys(patch).length === 0) { mergedUntouched++; continue; }
        const { error } = await supabase
          .from("orbit_prospects")
          .update(patch as any)
          .eq("id", existing.id)
          .eq("empresa_id", empresaId);
        if (error) errors.push(`Merge ${existing.id}: ${error.message}`);
        else updated++;
      }

      // 6) Audit / history
      try {
        await supabase.from("orbit_import_history").insert({
          empresa_id: empresaId,
          arquivo_nome: fileName,
          total_registros: rows.length,
          sucesso: inserted + updated,
          erros: errors.length,
          detalhes_erros: errors.slice(0, 50),
        });
      } catch {
        // non-blocking
      }

      return { inserted, updated, skipped, mergedUntouched, errors, listaTag };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orbitProspectKeys.all });
    },
  });
}

// ===== Backfill: vincular import antigo como "lista" =====

export function useImportHistory(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: ["orbit_import_history", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_import_history")
        .select("id, arquivo_nome, total_registros, sucesso, erros, created_at")
        .eq("empresa_id", empresaId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });
}

const slugifyName = (s: string) =>
  stripDiacritics(s)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "import";

export function buildListaTagFromImport(arquivoNome: string, createdAt: string): string {
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `lista:${slugifyName(arquivoNome)}-${stamp}`;
}

export function useBackfillImportAsList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      importId, empresaId, windowMinutes = 10,
    }: { importId: string; empresaId: string; windowMinutes?: number }) => {
      // Fetch the import row to compute the tag with the same convention used at import time
      const { data: imp, error: impErr } = await supabase
        .from("orbit_import_history")
        .select("id, arquivo_nome, created_at")
        .eq("id", importId)
        .eq("empresa_id", empresaId)
        .single();
      if (impErr || !imp) throw new Error(impErr?.message || "Importação não encontrada");

      const listaTag = buildListaTagFromImport(imp.arquivo_nome, imp.created_at);

      // Single server-side bulk update
      const { data, error } = await supabase.rpc("pe_backfill_import_as_lista", {
        p_import_id: importId,
        p_empresa_id: empresaId,
        p_lista_tag: listaTag,
        p_window_minutes: windowMinutes,
      });
      if (error) throw error;

      const res = (data ?? {}) as { lista_tag?: string; candidates?: number; tagged?: number; already_tagged?: number };

      return {
        listaTag: res.lista_tag ?? listaTag,
        candidates: res.candidates ?? 0,
        tagged: res.tagged ?? 0,
        alreadyTagged: res.already_tagged ?? 0,
        errors: [] as string[],
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orbitProspectKeys.all });
    },
  });
}
