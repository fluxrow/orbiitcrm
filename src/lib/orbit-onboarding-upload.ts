import { supabase } from "@/integrations/supabase/client";

export interface UploadedOnboardingAsset {
  asset_id: string;
  storage_path: string;
  filename: string;
  mime: string;
  size_bytes: number;
  /** Signed URL de curta duração (~1h) para preview imediato. Não persistir. */
  signed_url?: string | null;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Faz upload de um arquivo do wizard público de onboarding para o bucket
 * privado `orbit-media` via edge function (que também registra em
 * `orbit_onboarding_assets`). Retorna metadados que devem ser persistidos
 * dentro de `responses.<section>.<field>` no item correspondente.
 */
export async function uploadPublicOnboardingAsset(params: {
  token: string;
  section_key: string;
  field_key: string;
  item_id?: string;
  file: File;
}): Promise<UploadedOnboardingAsset> {
  const data_base64 = await fileToBase64(params.file);
  const { data, error } = await supabase.functions.invoke(
    "orbit-onboarding-asset-upload",
    {
      body: {
        token: params.token,
        section_key: params.section_key,
        field_key: params.field_key,
        item_id: params.item_id,
        filename: params.file.name,
        mime: params.file.type || "application/octet-stream",
        data_base64,
      },
    },
  );
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error?.message || "Falha no upload");
  return data.data as UploadedOnboardingAsset;
}
