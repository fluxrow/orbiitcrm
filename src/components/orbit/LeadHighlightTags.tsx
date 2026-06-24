import { Badge } from "@/components/ui/badge";
import { evaluateHighlights, useLeadHighlightRules } from "@/hooks/useLeadHighlightRules";

/**
 * Renderiza tags de destaque a partir das regras configuradas pela empresa.
 * Nenhuma regra global — se a empresa não configurou nada, nada aparece.
 * Cor de marca (#f9b217 via token --brand) para manter identidade editorial.
 */
export function LeadHighlightTags({
  empresaId,
  dadosAdicionais,
}: {
  empresaId: string | null | undefined;
  dadosAdicionais: unknown;
}) {
  const { data: rules } = useLeadHighlightRules(empresaId);
  const matched = evaluateHighlights(rules ?? [], dadosAdicionais);
  if (matched.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {matched.map((rule) => (
        <Badge
          key={rule.id}
          className="bg-brand/15 text-brand border border-brand/40 hover:bg-brand/20 text-[11px] font-medium"
        >
          {rule.emoji && <span className="mr-1">{rule.emoji}</span>}
          {rule.label}
        </Badge>
      ))}
    </div>
  );
}
