// Helper compartilhado para gerar signed URLs em assets do bucket privado
// `orbit-media`. Deve ser importado pelas edge functions que precisam expor
// URLs temporárias (Z-API, Resend, TTS).

const PUBLIC_MARKER = "/storage/v1/object/public/orbit-media/";
const SIGNED_MARKER = "/storage/v1/object/sign/orbit-media/";

/**
 * Aceita path puro, URL pública legada ou signed URL antiga e devolve o
 * storage path dentro do bucket orbit-media. Retorna null para URLs externas.
 */
export function extractOrbitMediaPath(input: string | null | undefined): string | null {
  if (!input) return null;
  const pubIdx = input.indexOf(PUBLIC_MARKER);
  if (pubIdx !== -1) {
    return decodeURIComponent(input.substring(pubIdx + PUBLIC_MARKER.length).split("?")[0]);
  }
  const signIdx = input.indexOf(SIGNED_MARKER);
  if (signIdx !== -1) {
    return decodeURIComponent(input.substring(signIdx + SIGNED_MARKER.length).split("?")[0]);
  }
  if (!/^https?:\/\//i.test(input) && !input.startsWith("blob:") && !input.startsWith("data:")) {
    return input.replace(/^\/+/, "");
  }
  return null;
}

/**
 * Assina uma URL/path de orbit-media com TTL configurável. Aceita path puro,
 * URL pública legada ou signed URL. Se não pertencer ao bucket, devolve a
 * entrada. Em erro na assinatura, também devolve a entrada original.
 */
export async function signOrbitMediaUrl(
  supabase: any,
  input: string | null | undefined,
  ttlSeconds = 60 * 60, // 1h por padrão
): Promise<string | null | undefined> {
  if (!input) return input;
  const path = extractOrbitMediaPath(input);
  if (!path) return input;
  try {
    const { data, error } = await supabase.storage
      .from("orbit-media")
      .createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) return input;
    return data.signedUrl;
  } catch (_e) {
    return input;
  }
}
