import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const PUBLIC_MARKER = "/storage/v1/object/public/orbit-media/";
const SIGNED_MARKER = "/storage/v1/object/sign/orbit-media/";

/**
 * Extrai o storage path de uma URL do bucket orbit-media
 * (aceita tanto URLs "public" legadas quanto signed URLs).
 * Retorna null quando não é do bucket orbit-media.
 */
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
 * Gera signed URL para um asset armazenado no bucket privado orbit-media.
 * Se a URL não pertencer ao bucket, é devolvida sem alteração.
 * Faz fallback silencioso para a URL original se a assinatura falhar.
 */
export async function signOrbitMediaUrl(
  url: string | null | undefined,
  ttlSeconds = 3600,
): Promise<string | null> {
  if (!url) return url ?? null;
  const path = extractOrbitMediaPath(url);
  if (!path) return url;
  const { data, error } = await supabase.storage
    .from("orbit-media")
    .createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) return url;
  return data.signedUrl;
}

/**
 * Hook: recebe uma URL crua do orbit-media e devolve uma signed URL válida.
 * TTL padrão de 1h — refaz assinatura quando a URL de entrada muda.
 */
export function useSignedOrbitMediaUrl(
  url: string | null | undefined,
  ttlSeconds = 3600,
): string | null {
  const [signed, setSigned] = useState<string | null>(url ?? null);
  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setSigned(null);
      return;
    }
    // Nada a assinar se não for do bucket orbit-media
    if (!extractOrbitMediaPath(url)) {
      setSigned(url);
      return;
    }
    signOrbitMediaUrl(url, ttlSeconds).then((v) => {
      if (!cancelled) setSigned(v);
    });
    return () => {
      cancelled = true;
    };
  }, [url, ttlSeconds]);
  return signed;
}
