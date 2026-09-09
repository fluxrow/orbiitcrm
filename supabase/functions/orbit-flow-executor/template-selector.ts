type TemplateSelectorConfig = {
  template_id?: unknown;
  template_by_payload?: {
    path?: unknown;
    values?: unknown;
    fallback_template_id?: unknown;
  } | null;
};

function readPath(value: unknown, path: string): unknown {
  return path.split(".").filter(Boolean).reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

export function resolveTemplateIdFromPayload(
  config: TemplateSelectorConfig,
  payload: unknown,
): string | null {
  const selector = config.template_by_payload;
  if (selector && typeof selector === "object") {
    const path = typeof selector.path === "string" ? selector.path.trim() : "";
    const values = selector.values && typeof selector.values === "object"
      ? selector.values as Record<string, unknown>
      : {};
    const actual = path ? readPath(payload, path) : undefined;
    const selected = values[String(actual ?? "")];
    if (typeof selected === "string" && selected.trim()) return selected.trim();
    if (typeof selector.fallback_template_id === "string" && selector.fallback_template_id.trim()) {
      return selector.fallback_template_id.trim();
    }
  }
  return typeof config.template_id === "string" && config.template_id.trim()
    ? config.template_id.trim()
    : null;
}
