import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const { cnpj } = await req.json();
    if (!cnpj) {
      return fail(ErrorCodes.VALIDATION_ERROR, "CNPJ é obrigatório", 400, undefined, req);
    }

    const digits = String(cnpj).replace(/\D/g, "");
    if (digits.length !== 14) {
      return fail(ErrorCodes.CNPJ_INVALID, "CNPJ deve ter 14 dígitos", 400, undefined, req);
    }

    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
    if (!res.ok) {
      return fail(ErrorCodes.CNPJ_LOOKUP_FAILED, "Não foi possível consultar o CNPJ. Preencha manualmente.", 200, { manual: true }, req);
    }

    const data = await res.json();

    return ok({
      razao_social: data.razao_social || "",
      nome_fantasia: data.nome_fantasia || "",
      logradouro: data.logradouro || "",
      numero: data.numero || "",
      bairro: data.bairro || "",
      municipio: data.municipio || "",
      uf: data.uf || "",
      cnae_fiscal_descricao: data.cnae_fiscal_descricao || "",
    }, undefined, req);
  } catch (e) {
    return fail(ErrorCodes.INTERNAL_ERROR, e.message || "Erro interno", 500, { manual: true }, req);
  }
});
