import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const PUBLIC_MARKER = "/storage/v1/object/public/orbit-media/";
const SIGNED_MARKER = "/storage/v1/object/sign/orbit-media/";

/**
 * Extrai o storage path do bucket orbit-media a partir de:
 *  - URL "public" legada (`.../object/public/orbit-media/<path>`)
 *  - Signed URL (`.../object/sign/orbit-media/<path>?token=...`)
 *  - Path puro (ex.: `<empresa_id>/conversas/xxx.jpg`) — devolve como está.
 * Retorna null se for uma URL externa (não é do bucket).
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
  // Path puro — qualquer coisa que não seja URL externa é tratada como path do bucket.
  if (!/^https?:\/\//i.test(input) && !input.startsWith("blob:") && !input.startsWith("data:")) {
    return input.replace(/^\/+/, "");
  }
  return null;
}

/**
 * Gera signed URL para um asset do bucket privado orbit-media.
 * Aceita path puro, URL pública legada ou signed URL antiga.
 * Se não for do bucket, devolve a entrada inalterada.
 *
 * IMPORTANTE: signed URLs NÃO devem ser persistidas — são regeneradas
 * sob demanda a partir do storage_path.
 */
export async function signOrbitMediaUrl(
  input: string | null | undefined,
  ttlSeconds = 3600,
): Promise<string | null> {
  if (!input) return input ?? null;
  const path = extractOrbitMediaPath(input);
  if (!path) return input;
  const { data, error } = await supabase.storage
    .from("orbit-media")
    .createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) return input;
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
