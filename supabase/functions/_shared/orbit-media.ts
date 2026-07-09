// Helper compartilhado para gerar signed URLs em assets do bucket privado
// `orbit-media`. Deve ser importado pelas edge functions que precisam expor
// URLs temporárias (Z-API, Resend, TTS).

const PUBLIC_MARKER = "/storage/v1/object/public/orbit-media/";
const SIGNED_MARKER = "/storage/v1/object/sign/orbit-media/";

export function extractOrbitMediaPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const pubIdx = url.indexOf(PUBLIC_MARKER);
  if (pubIdx !== -1) {
    return decodeURIComponent(url.substring(pubIdx + PUBLIC_MARKER.length).split("?")[0]);
  }
  const signIdx = url.indexOf(SIGNED_MARKER);
  if (signIdx !== -1) {
    return decodeURIComponent(url.substring(signIdx + SIGNED_MARKER.length).split("?")[0]);
  }
  return null;
}

/**
 * Assina uma URL de orbit-media com TTL configurável. Se a URL não pertencer
 * ao bucket, é devolvida sem alteração. Em caso de falha na assinatura,
 * também devolve a URL original (para não quebrar fluxos que dependem dela).
 */
export async function signOrbitMediaUrl(
  supabase: any,
  url: string | null | undefined,
  ttlSeconds = 60 * 60, // 1h por padrão — suficiente para Z-API baixar mídia
): Promise<string | null | undefined> {
  if (!url) return url;
  const path = extractOrbitMediaPath(url);
  if (!path) return url;
  try {
    const { data, error } = await supabase.storage
      .from("orbit-media")
      .createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) return url;
    return data.signedUrl;
  } catch (_e) {
    return url;
  }
}
