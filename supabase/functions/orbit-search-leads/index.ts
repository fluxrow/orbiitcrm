import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, fromPlanCheck, ErrorCodes } from "../_shared/responses.ts";

interface SearchFilters {
  pais?: string;
  estado?: string;
  cidade?: string;
  cargos?: string[];
  segmentos?: string[];
  tamanhos?: string[];
}

function mapCompanySizes(tamanhos: string[]): string[] {
  const sizeMap: Record<string, string> = {
    "1-10": "1,10",
    "11-50": "11,50",
    "51-200": "51,200",
    "201-500": "201,500",
    "501-1000": "501,1000",
    "1001-5000": "1001,5000",
    "5001+": "5001,10000",
  };
  return tamanhos.map(t => sizeMap[t] || t);
}

function buildLocations(filters: SearchFilters): string[] {
  const locations: string[] = [];
  if (filters.cidade && filters.estado && filters.pais) {
    locations.push(`${filters.cidade}, ${filters.estado}, ${filters.pais}`);
  } else if (filters.estado && filters.pais) {
    locations.push(`${filters.estado}, ${filters.pais}`);
  } else if (filters.pais) {
    locations.push(filters.pais);
  }
  return locations;
}

function calculateScore(person: any): number {
  let score = 0;
  if (person.email) score += 30;
  if (person.phone_numbers?.length > 0) score += 20;
  if (person.linkedin_url) score += 15;
  if (person.title) score += 10;
  if (person.organization?.name) score += 10;
  if (person.city) score += 5;
  if (person.state) score += 5;
  if (person.country) score += 5;
  return Math.min(score, 100);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  // Verify caller is authenticated
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return fail(ErrorCodes.UNAUTHORIZED, "Token obrigatório", 401);
  const { data: { user: callerUser }, error: authError } = await createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  ).auth.getUser(authHeader.replace("Bearer ", ""));
  if (authError || !callerUser) return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { search_id } = await req.json();

    if (!search_id) {
      return fail(ErrorCodes.VALIDATION_ERROR, "search_id é obrigatório");
    }

    const { data: search, error: searchError } = await supabase
      .from("orbit_lead_searches")
      .select("*, source:orbit_lead_sources(*)")
      .eq("id", search_id)
      .single();

    if (searchError || !search) {
      return fail(ErrorCodes.NOT_FOUND, "Busca não encontrada", 404);
    }

    // ── Plan enforcement ──
    if (search.empresa_id) {
      const { data: canUseResult } = await supabase.rpc("saas_can_use", {
        p_empresa_id: search.empresa_id,
        p_feature_code: "lead_search",
        p_amount: 1,
      });

      const planResponse = fromPlanCheck(canUseResult);
      if (planResponse) {
        await supabase
          .from("orbit_lead_searches")
          .update({ status: "erro" })
          .eq("id", search_id);
        return planResponse;
      }
    }

    const apiKey = search.source?.config?.api_key;
    if (!apiKey) {
      await supabase
        .from("orbit_lead_searches")
        .update({ status: "erro" })
        .eq("id", search_id);
      return fail(ErrorCodes.PROVIDER_NOT_CONFIGURED, "API key do Apollo não configurada na fonte");
    }

    await supabase
      .from("orbit_lead_searches")
      .update({ status: "executando" })
      .eq("id", search_id);

    const filters = search.filtros as SearchFilters || {};
    const apolloBody: Record<string, any> = { page: 1, per_page: 100 };

    if (filters.cargos?.length) apolloBody.person_titles = filters.cargos;
    const locations = buildLocations(filters);
    if (locations.length > 0) apolloBody.person_locations = locations;
    if (filters.segmentos?.length) apolloBody.q_organization_keyword_tags = filters.segmentos;
    if (filters.tamanhos?.length) apolloBody.organization_num_employees_ranges = mapCompanySizes(filters.tamanhos);

    console.log("Apollo request body:", JSON.stringify(apolloBody));

    const apolloResponse = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(apolloBody),
    });

    if (!apolloResponse.ok) {
      const errorText = await apolloResponse.text();
      console.error("Apollo API error:", apolloResponse.status, errorText);
      await supabase.from("orbit_lead_searches").update({ status: "erro" }).eq("id", search_id);
      return fail(
        ErrorCodes.PROVIDER_SEND_FAILED,
        `Erro na API Apollo: ${apolloResponse.status}`,
        502,
        { provider: "apollo", original_status: apolloResponse.status },
      );
    }

    const apolloData = await apolloResponse.json();
    const people = apolloData.people || [];

    const leadsToInsert = people.map((person: any) => ({
      empresa_id: search.empresa_id,
      search_id,
      nome: [person.first_name, person.last_name].filter(Boolean).join(" ") || null,
      cargo: person.title || null,
      empresa_nome: person.organization?.name || null,
      empresa_linkedin: person.organization?.linkedin_url || null,
      email: person.email || null,
      telefone: person.phone_numbers?.[0]?.sanitized_number || null,
      linkedin_url: person.linkedin_url || null,
      pais: person.country || null,
      estado: person.state || null,
      cidade: person.city || null,
      score: calculateScore(person),
      status: "novo",
      enrichment_status: person.email ? "sucesso" : "pendente",
      dados_raw: person,
    }));

    let insertedCount = 0;
    if (leadsToInsert.length > 0) {
      const { data: insertedLeads, error: insertError } = await supabase
        .from("orbit_leads")
        .insert(leadsToInsert)
        .select();
      if (insertError) console.error("Error inserting leads:", insertError);
      else insertedCount = insertedLeads?.length || 0;
    }

    if (search.empresa_id) {
      await supabase.rpc("saas_increment_usage", {
        p_empresa_id: search.empresa_id,
        p_feature_code: "lead_search",
        p_amount: 1,
      });
    }

    await supabase.from("orbit_lead_searches").update({
      status: "concluida",
      leads_encontrados: apolloData.pagination?.total_entries || people.length,
      leads_importados: insertedCount,
      executed_at: new Date().toISOString(),
    }).eq("id", search_id);

    return ok({
      total_found: apolloData.pagination?.total_entries || people.length,
      imported: insertedCount,
      search_id,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return fail(ErrorCodes.INTERNAL_ERROR, errorMessage, 500);
  }
});
