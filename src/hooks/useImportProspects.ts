import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

type ProspectInsert = TablesInsert<"orbit_prospects">;

interface ImportResult {
  success: number;
  errors: number;
  errorDetails: { row: number; field: string; message: string }[];
}

interface ParsedProspect {
  nome_razao: string;
  nome_fantasia?: string;
  tipo?: string;
  cnpj_cpf?: string;
  email_principal?: string;
  telefone_whatsapp?: string;
  cidade?: string;
  estado?: string;
  segmento?: string;
  origem_lead?: string;
  observacoes?: string;
  tags?: string[];
}

// Mapeamento de colunas CSV para campos do banco
const COLUMN_MAP: Record<string, keyof ParsedProspect> = {
  'nome': 'nome_razao',
  'nome_razao': 'nome_razao',
  'razao_social': 'nome_razao',
  'nome_fantasia': 'nome_fantasia',
  'fantasia': 'nome_fantasia',
  'tipo': 'tipo',
  'cnpj': 'cnpj_cpf',
  'cpf': 'cnpj_cpf',
  'cnpj_cpf': 'cnpj_cpf',
  'documento': 'cnpj_cpf',
  'email': 'email_principal',
  'email_principal': 'email_principal',
  'e-mail': 'email_principal',
  'telefone': 'telefone_whatsapp',
  'whatsapp': 'telefone_whatsapp',
  'telefone_whatsapp': 'telefone_whatsapp',
  'celular': 'telefone_whatsapp',
  'cidade': 'cidade',
  'estado': 'estado',
  'uf': 'estado',
  'segmento': 'segmento',
  'setor': 'segmento',
  'origem': 'origem_lead',
  'origem_lead': 'origem_lead',
  'fonte': 'origem_lead',
  'observacoes': 'observacoes',
  'obs': 'observacoes',
  'notas': 'observacoes',
  'tags': 'tags',
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ');
}

function detectSeparator(firstLine: string): string {
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return semicolonCount > commaCount ? ';' : ',';
}

function normalizeColumnName(col: string): string {
  return col
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9_]/g, '_');
}

function parseCSVLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSV(csvText: string): { prospects: ParsedProspect[]; errors: { row: number; field: string; message: string }[] } {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) {
    return { prospects: [], errors: [{ row: 0, field: 'arquivo', message: 'Arquivo vazio ou sem dados' }] };
  }

  const separator = detectSeparator(lines[0]);
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine, separator).map(normalizeColumnName);

  const prospects: ParsedProspect[] = [];
  const errors: { row: number; field: string; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line, separator);
    const prospect: Partial<ParsedProspect> = {};

    headers.forEach((header, index) => {
      const mappedField = COLUMN_MAP[header];
      if (mappedField && values[index]) {
        const value = values[index].replace(/^["']|["']$/g, '').trim();
        if (mappedField === 'tags') {
          prospect.tags = value.split(/[,;]/).map(t => t.trim()).filter(Boolean);
        } else {
          (prospect as any)[mappedField] = value;
        }
      }
    });

    // Validação: nome_razao é obrigatório
    if (!prospect.nome_razao) {
      errors.push({ row: i + 1, field: 'nome_razao', message: 'Nome/Razão Social é obrigatório' });
      continue;
    }

    // Validação de email
    if (prospect.email_principal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prospect.email_principal)) {
      errors.push({ row: i + 1, field: 'email', message: 'Email inválido' });
    }

    // Normalizar tipo
    if (prospect.tipo) {
      const tipoLower = prospect.tipo.toLowerCase();
      if (tipoLower.includes('empresa') || tipoLower.includes('pj')) {
        prospect.tipo = 'empresa';
      } else {
        prospect.tipo = 'pessoa';
      }
    }

    prospects.push(prospect as ParsedProspect);
  }

  return { prospects, errors };
}

export function generateCSVTemplate(): string {
  const headers = [
    'nome_razao',
    'nome_fantasia', 
    'tipo',
    'cnpj_cpf',
    'email',
    'telefone',
    'cidade',
    'estado',
    'segmento',
    'origem',
    'observacoes',
    'tags'
  ];
  
  const exampleRow = [
    'Empresa Exemplo Ltda',
    'Exemplo',
    'empresa',
    '12.345.678/0001-90',
    'contato@exemplo.com.br',
    '(11) 99999-9999',
    'São Paulo',
    'SP',
    'Tecnologia',
    'Site',
    'Cliente potencial',
    'lead,tecnologia'
  ];

  return `${headers.join(';')}\n${exampleRow.join(';')}`;
}

export function useImportProspects() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      prospects, 
      fileName,
      ignoreDuplicates = true 
    }: { 
      prospects: ParsedProspect[]; 
      fileName: string;
      ignoreDuplicates?: boolean;
    }): Promise<ImportResult> => {
      // Get user info for empresa_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('empresa_id')
        .eq('id', user.id)
        .single();

      if (!profile?.empresa_id) throw new Error('Empresa não encontrada');

      let success = 0;
      let errors = 0;
      const errorDetails: { row: number; field: string; message: string }[] = [];

      // Check for duplicates if needed
      let existingEmails: Set<string> = new Set();
      let existingPhones: Set<string> = new Set();
      let existingNames: Set<string> = new Set();

      if (ignoreDuplicates) {
        // Paginate to fetch ALL existing prospects (bypass 1000 row default limit)
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: page } = await supabase
            .from('orbit_prospects')
            .select('nome_razao, email_principal, telefone_whatsapp')
            .eq('empresa_id', profile.empresa_id)
            .range(from, from + pageSize - 1);

          if (page && page.length > 0) {
            page.forEach(p => {
              if (p.email_principal) existingEmails.add(p.email_principal.toLowerCase());
              if (p.telefone_whatsapp) {
                const cleaned = p.telefone_whatsapp.replace(/\D/g, '');
                if (cleaned) existingPhones.add(cleaned);
              }
              if (p.nome_razao) {
                existingNames.add(normalizeName(p.nome_razao));
              }
            });
            from += pageSize;
            hasMore = page.length === pageSize;
          } else {
            hasMore = false;
          }
        }
      }

      // Filter out duplicates and build valid prospects list
      const validProspects: { index: number; data: ProspectInsert }[] = [];

      for (let i = 0; i < prospects.length; i++) {
        const prospect = prospects[i];

        if (ignoreDuplicates) {
          const email = prospect.email_principal?.toLowerCase();
          const phone = prospect.telefone_whatsapp?.replace(/\D/g, '');
          const normalizedName = normalizeName(prospect.nome_razao);

          if (email && existingEmails.has(email)) {
            errorDetails.push({ row: i + 2, field: 'email', message: 'Email já existe' });
            errors++;
            continue;
          }
          if (phone && existingPhones.has(phone)) {
            errorDetails.push({ row: i + 2, field: 'telefone', message: 'Telefone já existe' });
            errors++;
            continue;
          }
          if (normalizedName && existingNames.has(normalizedName)) {
            errorDetails.push({ row: i + 2, field: 'nome_razao', message: 'Nome já existe' });
            errors++;
            continue;
          }

          // Add to sets to avoid intra-import duplicates
          if (email) existingEmails.add(email);
          if (phone) existingPhones.add(phone);
          if (normalizedName) existingNames.add(normalizedName);
        }

        validProspects.push({
          index: i,
          data: {
            empresa_id: profile.empresa_id,
            nome_razao: prospect.nome_razao,
            nome_fantasia: prospect.nome_fantasia || null,
            tipo: prospect.tipo || 'pessoa',
            cnpj_cpf: prospect.cnpj_cpf || null,
            email_principal: prospect.email_principal || null,
            telefone_whatsapp: prospect.telefone_whatsapp || null,
            cidade: prospect.cidade || null,
            estado: prospect.estado || null,
            segmento: prospect.segmento || null,
            origem_lead: prospect.origem_lead || null,
            observacoes: prospect.observacoes || null,
            tags: prospect.tags || [],
            origem_contato: 'IMPORTACAO',
            status_qualificacao: 'novo',
          },
        });
      }

      // Batch insert in chunks of 100
      const BATCH_SIZE = 100;
      for (let b = 0; b < validProspects.length; b += BATCH_SIZE) {
        const batch = validProspects.slice(b, b + BATCH_SIZE);
        const { error, data } = await supabase
          .from('orbit_prospects')
          .insert(batch.map(item => item.data));

        if (error) {
          // If batch fails, try individual inserts as fallback
          for (const item of batch) {
            const { error: singleError } = await supabase
              .from('orbit_prospects')
              .insert(item.data);
            if (singleError) {
              errorDetails.push({ row: item.index + 2, field: 'banco', message: singleError.message });
              errors++;
            } else {
              success++;
            }
          }
        } else {
          success += batch.length;
        }
      }

      // Save import history
      await supabase.from('orbit_import_history').insert({
        empresa_id: profile.empresa_id,
        arquivo_nome: fileName,
        total_registros: prospects.length,
        sucesso: success,
        erros: errors,
        detalhes_erros: errorDetails,
        importado_por: user.id,
      });

      return { success, errors, errorDetails };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orbit_prospects'] });
      queryClient.invalidateQueries({ queryKey: ['orbit_import_history'] });
    },
  });
}

export function useImportHistory() {
  return useQuery({
    queryKey: ['orbit_import_history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orbit_import_history')
        .select('*, importado_por:profiles!orbit_import_history_importado_por_fkey(nome)')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
  });
}
