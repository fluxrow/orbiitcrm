import { supabase } from "@/integrations/supabase/client";

export interface UploadCampaignImageParams {
  file: File;
  empresaId: string;
  context?: "campaigns" | "template" | "email_template" | string;
}

export interface UploadCampaignImageResult {
  storage_path: string;
  public_url: string;
}

/**
 * Upload de imagem de campanha via Edge Function autenticada.
 * O path é gerado inteiramente no servidor — o cliente nunca controla o prefixo,
 * fechando a brecha de path-convention no bucket público `campaign-images`.
 */
export async function uploadCampaignImage({
  file,
  empresaId,
  context = "campaigns",
}: UploadCampaignImageParams): Promise<UploadCampaignImageResult> {
  if (!empresaId) throw new Error("empresa_id obrigatório");
  if (!file) throw new Error("arquivo obrigatório");
  if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem");
  if (file.size > 5 * 1024 * 1024) throw new Error("Imagem deve ter no máximo 5MB");

  const form = new FormData();
  form.append("file", file);
  form.append("empresa_id", empresaId);
  form.append("context", context);

  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Não autenticado");

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orbit-campaign-image-upload`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
    body: form,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error?.message ?? `Falha no upload (${res.status})`);
  }
  return json.data as UploadCampaignImageResult;
}
