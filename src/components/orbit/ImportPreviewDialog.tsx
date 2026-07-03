import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FlowTemplateExport } from "@/lib/flowTemplateSchema";
import {
  remapFlowDefinition,
  validateImportAgainstTenant,
} from "@/lib/flowTemplateSchema";

export type ImportPreviewDialogProps = {
  open: boolean;
  parsed: FlowTemplateExport | null;
  availableTemplates: { id: string; nome: string }[];
  availableAgents: { slug: string; nome?: string | null }[];
  onCancel: () => void;
  onConfirm: (patched: FlowTemplateExport) => void;
};

export function ImportPreviewDialog({
  open,
  parsed,
  availableTemplates,
  availableAgents,
  onCancel,
  onConfirm,
}: ImportPreviewDialogProps) {
  const [templateMap, setTemplateMap] = useState<Record<string, string>>({});
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});

  const validation = useMemo(() => {
    if (!parsed) return null;
    // Aplica o mapeamento atual antes de validar
    const patchedDef = remapFlowDefinition(parsed.definicao, templateMap, agentMap);
    return validateImportAgainstTenant(patchedDef, {
      availableTemplateIds: availableTemplates.map((t) => t.id),
      availableAgentSlugs: availableAgents.map((a) => a.slug),
    });
  }, [parsed, templateMap, agentMap, availableTemplates, availableAgents]);

  if (!parsed || !validation) return null;

  const { inspection, missingTemplateIds, missingAgentSlugs, blocking } = validation;

  const confirm = () => {
    const patchedDef = remapFlowDefinition(parsed.definicao, templateMap, agentMap);
    onConfirm({ ...parsed, definicao: patchedDef });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prévia do import: {parsed.nome}</DialogTitle>
          <DialogDescription>
            Validando placeholders, templates de mensagem e agentes de IA
            referenciados por este fluxo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Placeholders */}
          <section>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              {inspection.unknownPlaceholders.length === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
              )}
              Placeholders ({inspection.placeholders.length})
            </h4>
            {inspection.placeholders.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum placeholder detectado.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {inspection.placeholders.map((p) => {
                  const bad = inspection.unknownPlaceholders.includes(p);
                  return (
                    <Badge
                      key={p}
                      className={
                        bad
                          ? "bg-yellow-500/20 text-yellow-300"
                          : "bg-green-500/15 text-green-300"
                      }
                    >
                      {`{{${p}}}`}
                    </Badge>
                  );
                })}
              </div>
            )}
            {inspection.unknownPlaceholders.length > 0 && (
              <p className="text-xs text-yellow-400 mt-2">
                Placeholders em amarelo não estão na whitelist do tenant e não serão
                substituídos em runtime.
              </p>
            )}
          </section>

          {/* Templates de mensagem */}
          <section>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              {missingTemplateIds.length === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400" />
              )}
              Templates de mensagem ({inspection.usedTemplateIds.length})
            </h4>
            {inspection.usedTemplateIds.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum template referenciado.</p>
            ) : (
              <div className="space-y-2">
                {inspection.usedTemplateIds.map((id) => {
                  const missing = missingTemplateIds.includes(id);
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 text-xs p-2 rounded border border-border"
                    >
                      <code className="font-mono flex-1 truncate">{id}</code>
                      {missing ? (
                        <div className="flex items-center gap-2 min-w-[220px]">
                          <span className="text-red-400">Ausente</span>
                          <Select
                            value={templateMap[id] ?? ""}
                            onValueChange={(v) =>
                              setTemplateMap((m) => ({ ...m, [id]: v }))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Mapear para..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableTemplates.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <span className="text-green-400">OK</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Agentes IA */}
          <section>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              {missingAgentSlugs.length === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400" />
              )}
              Agentes de IA ({inspection.usedAgentSlugs.length})
            </h4>
            {inspection.usedAgentSlugs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum agente referenciado.</p>
            ) : (
              <div className="space-y-2">
                {inspection.usedAgentSlugs.map((slug) => {
                  const missing = missingAgentSlugs.includes(slug);
                  return (
                    <div
                      key={slug}
                      className="flex items-center gap-2 text-xs p-2 rounded border border-border"
                    >
                      <code className="font-mono flex-1 truncate">{slug}</code>
                      {missing ? (
                        <div className="flex items-center gap-2 min-w-[220px]">
                          <span className="text-red-400">Ausente</span>
                          <Select
                            value={agentMap[slug] ?? ""}
                            onValueChange={(v) =>
                              setAgentMap((m) => ({ ...m, [slug]: v }))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Mapear para..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableAgents.map((a) => (
                                <SelectItem key={a.slug} value={a.slug}>
                                  {a.nome ?? a.slug}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <span className="text-green-400">OK</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            onClick={confirm}
            disabled={blocking}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            title={
              blocking
                ? "Resolva os itens ausentes antes de importar"
                : "Importar template"
            }
          >
            {blocking ? "Mapeamento pendente" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
