const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function extractTemplateVariables(
  ...texts: Array<string | null | undefined>
): string[] {
  const variables = new Set<string>();

  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
      variables.add(match[1] ?? match[2]);
    }
  }

  return [...variables];
}

export function renderTemplateVariables(
  text: string,
  variables: Record<string, string>,
): string {
  return text.replace(
    TEMPLATE_VARIABLE_PATTERN,
    (token, canonicalKey: string | undefined, legacyKey: string | undefined) => {
      const key = canonicalKey ?? legacyKey;
      if (!key || !Object.prototype.hasOwnProperty.call(variables, key)) return token;
      return variables[key] ?? "";
    },
  );
}
