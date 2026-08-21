const INTERNAL_ORIGIN = "https://orbit.invalid";
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Accepts only same-origin absolute paths for post-authentication redirects.
 * Backslashes are rejected explicitly because browsers and routers may
 * normalize them into protocol-relative URLs.
 */
export function isSafeInternalRedirect(value: string | null): value is string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return false;
  }

  if (value.includes("\\") || /%5c/i.test(value) || CONTROL_CHARACTERS.test(value)) {
    return false;
  }

  try {
    let decoded = value;
    for (let pass = 0; pass < 3; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (
        next.startsWith("//") ||
        next.includes("\\") ||
        CONTROL_CHARACTERS.test(next)
      ) {
        return false;
      }
      if (next === decoded) break;
      decoded = next;
    }

    const parsed = new URL(value, INTERNAL_ORIGIN);
    return parsed.origin === INTERNAL_ORIGIN && parsed.pathname.startsWith("/");
  } catch {
    return false;
  }
}
