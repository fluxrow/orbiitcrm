import { useCallback, useEffect, useRef, useState } from "react";
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
 *
 * IMPORTANTE: signed URLs NÃO devem ser persistidas no banco. Elas expiram
 * (TTL) e são regeneradas sob demanda a partir do storage_path original.
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

export interface SignedOrbitMedia {
  /** Signed URL vigente (ou a URL original quando não é do bucket orbit-media). */
  url: string | null;
  /**
   * Força a regeneração da signed URL a partir do storage_path.
   * Deve ser chamado no `onError` de <img>/<audio>/<video> quando o preview
   * falhar por URL expirada. Só refaz uma vez por ciclo de erro para evitar loop.
   */
  refresh: () => void;
}

/**
 * Hook: recebe uma URL crua do orbit-media e devolve uma signed URL válida
 * junto com um callback de refresh para fallback em caso de expiração.
 * TTL padrão de 1h — refaz assinatura quando a URL de entrada muda.
 *
 * A signed URL fica apenas em estado local (nunca é persistida).
 */
export function useSignedOrbitMedia(
  url: string | null | undefined,
  ttlSeconds = 3600,
): SignedOrbitMedia {
  const [signed, setSigned] = useState<string | null>(url ?? null);
  const [version, setVersion] = useState(0);
  // Trava anti-loop: só permite 1 refresh por assinatura ativa.
  const refreshedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    refreshedRef.current = false;
    if (!url) {
      setSigned(null);
      return;
    }
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
  }, [url, ttlSeconds, version]);

  const refresh = useCallback(() => {
    if (refreshedRef.current) return;
    if (!url || !extractOrbitMediaPath(url)) return;
    refreshedRef.current = true;
    setVersion((v) => v + 1);
  }, [url]);

  return { url: signed, refresh };
}

/**
 * Variante compatível: devolve apenas a signed URL como string.
 * Prefira `useSignedOrbitMedia` quando precisar do fallback de refresh.
 */
export function useSignedOrbitMediaUrl(
  url: string | null | undefined,
  ttlSeconds = 3600,
): string | null {
  return useSignedOrbitMedia(url, ttlSeconds).url;
}
