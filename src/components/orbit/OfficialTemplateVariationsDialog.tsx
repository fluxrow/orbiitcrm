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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { inspectFlowDefinition } from "@/lib/flowTemplateSchema";
import type { OrbitFlowTemplate } from "@/hooks/useOrbitFlows";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function OfficialTemplateVariationsDialog({
  template,
  onClose,
}: {
  template: OrbitFlowTemplate | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const insp = useMemo(
    () => (template ? inspectFlowDefinition(template.definicao) : null),
    [template],
  );

  const [templateMap, setTemplateMap] = useState<Record<string, string>>({});
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (!template) return null;

  const save = async () => {
    setSaving(true);
    try {
      const templates = Object.fromEntries(
        Object.entries(templateMap).filter(([, v]) => v.trim()),
      );
      const agents = Object.fromEntries(
        Object.entries(agentMap).filter(([, v]) => v.trim()),
      );
      if (Object.keys(templates).length === 0 && Object.keys(agents).length === 0) {
        toast.info("Nenhuma variação preenchida.");
        setSaving(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke(
        "orbit-flow-template-variation",
        {
          body: {
            template_id: template.id,
            variations: { templates, agents },
          },
        },
      );
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).error ?? "Falha");
      toast.success("Variações aplicadas ao template oficial.");
      qc.invalidateQueries({ queryKey: ["flow-templates-admin"] });
      qc.invalidateQueries({ queryKey: ["orbit-flow-templates"] });
      onClose();
    } catch (e: any) {
      toast.error(`Falha: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand" />
            Configurar variações · {template.nome}
          </DialogTitle>
          <DialogDescription>
            Templates oficiais são imutáveis. Aqui você pode apenas trocar as
            <strong> referências</strong> a templates de mensagem e a slugs de
            agentes de IA usadas por dentro. Deixe em branco para preservar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded border border-border bg-muted/20">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            A estrutura do fluxo (triggers, condições, ordem das ações) permanece
            intacta. Para editar tudo, duplique como um template comum antes.
          </span>
        </div>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold">
            Templates de mensagem referenciados
          </h4>
          {insp && insp.usedTemplateIds.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum referenciado.</p>
          ) : (
            insp?.usedTemplateIds.map((id) => (
              <div key={id} className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                  {id.slice(0, 8)}…
                </Badge>
                <Input
                  placeholder="Novo template_id (deixe em branco para manter)"
                  value={templateMap[id] ?? ""}
                  onChange={(e) =>
                    setTemplateMap((m) => ({ ...m, [id]: e.target.value }))
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
            ))
          )}
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold">Agentes de IA referenciados</h4>
          {insp && insp.usedAgentSlugs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum referenciado.</p>
          ) : (
            insp?.usedAgentSlugs.map((slug) => (
              <div key={slug} className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {slug}
                </Badge>
                <Input
                  placeholder="Novo agent_slug (deixe em branco para manter)"
                  value={agentMap[slug] ?? ""}
                  onChange={(e) =>
                    setAgentMap((m) => ({ ...m, [slug]: e.target.value }))
                  }
                  className="h-8 text-xs"
                />
              </div>
            ))
          )}
        </section>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {saving ? "Aplicando..." : "Aplicar variações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
