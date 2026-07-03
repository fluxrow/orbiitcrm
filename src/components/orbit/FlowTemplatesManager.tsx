import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Layers, Plus, Pencil, Copy, Trash2, Search, AlertCircle, CheckCircle2, Download, Upload, ShieldCheck, Settings2, Lock } from "lucide-react";
import {
  useAllFlowTemplates,
  useDeleteFlowTemplate,
  useToggleFlowTemplate,
  useUpsertFlowTemplate,
} from "@/hooks/useFlowTemplatesAdmin";
import type { OrbitFlowTemplate } from "@/hooks/useOrbitFlows";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  buildTemplateExport,
  parseTemplateImport,
  type FlowTemplateExport,
} from "@/lib/flowTemplateSchema";
import { useEffect, useRef } from "react";
import { ImportPreviewDialog } from "./ImportPreviewDialog";
import { OfficialTemplateVariationsDialog } from "./OfficialTemplateVariationsDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const EMPTY_DEF = `{
  "trigger_type": "lead_recebido",
  "trigger_config": {},
  "condicoes": {},
  "actions": []
}`;

type EditorState = {
  open: boolean;
  template: OrbitFlowTemplate | null;
  duplicate?: boolean;
};

export function FlowTemplatesManager() {
  const { data: templates, isLoading } = useAllFlowTemplates();
  const toggle = useToggleFlowTemplate();
  const del = useDeleteFlowTemplate();
  const upsert = useUpsertFlowTemplate();
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<EditorState>({ open: false, template: null });
  const [variationsFor, setVariationsFor] = useState<OrbitFlowTemplate | null>(null);
  const [importPreview, setImportPreview] = useState<FlowTemplateExport | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Referências disponíveis (globalmente visíveis para o admin) para o preview de import.
  const { data: availableTemplates = [] } = useQuery({
    queryKey: ["flow-import-templates"],
    queryFn: async () => {
      const { data } = await (supabase.from("orbit_message_templates" as any) as any)
        .select("id, nome")
        .limit(1000);
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
  const { data: availableAgents = [] } = useQuery({
    queryKey: ["flow-import-agents"],
    queryFn: async () => {
      const { data } = await (supabase.from("orbit_ai_config" as any) as any)
        .select("agent_slug, nome_agente")
        .limit(1000);
      return ((data ?? []) as any[])
        .filter((r) => r.agent_slug)
        .map((r) => ({ slug: r.agent_slug as string, nome: r.nome_agente as string | null }));
    },
  });

  const handleExport = (t: OrbitFlowTemplate) => {
    const payload = buildTemplateExport(t);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = t.nome.replace(/[^\w.-]+/g, "_");
    a.href = url;
    a.download = `${safeName}.flow.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exportado: ${a.download}`);
  };

  const doUpsert = (data: FlowTemplateExport, shouldUpdate: boolean, existingId?: string) => {
    upsert.mutate(
      {
        id: shouldUpdate ? existingId : undefined,
        nome: shouldUpdate ? data.nome : existingId ? `${data.nome} (import)` : data.nome,
        descricao: data.descricao ?? null,
        categoria: data.categoria ?? null,
        definicao: data.definicao,
        ativo: true,
        is_global: true,
      },
      {
        onSuccess: () => toast.success(shouldUpdate ? "Template atualizado" : "Template importado"),
        onError: (e: any) => toast.error(e.message),
      },
    );
  };

  const handleImport = async (file: File) => {
    try {
      const txt = await file.text();
      const parsed = parseTemplateImport(txt);
      if (parsed.ok !== true) {
        toast.error(`Import falhou: ${(parsed as { error: string }).error}`);
        return;
      }
      // Abre o preview para validação de placeholders / templates / agentes.
      setImportPreview(parsed.data);
    } catch (e: any) {
      toast.error(`Falha ao ler arquivo: ${e.message}`);
    }
  };

  const confirmImport = (patched: FlowTemplateExport) => {
    const existing = (templates ?? []).find((t) => t.nome === patched.nome);
    const shouldUpdate = existing
      ? confirm(
          `Template "${patched.nome}" já existe.\n\nOK = atualizar existente\nCancelar = criar cópia`,
        )
      : false;
    doUpsert(patched, shouldUpdate, existing?.id);
    setImportPreview(null);
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = templates ?? [];
    if (!s) return list;
    return list.filter(
      (t) =>
        t.nome.toLowerCase().includes(s) ||
        (t.descricao ?? "").toLowerCase().includes(s) ||
        (t.categoria ?? "").toLowerCase().includes(s)
    );
  }, [templates, search]);

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Gerenciador de Templates de Fluxo
          </CardTitle>
          <CardDescription>
            CRUD global dos templates disponíveis no wizard "Novo Fluxo".
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            onClick={() => importInputRef.current?.click()}
            title="Importar template .flow.json"
          >
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => setEditor({ open: true, template: null })}
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo template
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, descrição ou categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Layers className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhum template encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((t) => {
              const ativo = t.ativo ?? true;
              return (
                <div
                  key={t.id}
                  className="group relative rounded-lg border border-border bg-card/40 hover:bg-card/60 transition p-4 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold leading-tight break-words flex items-center gap-2 flex-wrap">
                        {t.nome}
                        {(t as any).is_official && (
                          <Badge className="bg-brand/20 text-brand text-[10px] gap-1">
                            <ShieldCheck className="h-3 w-3" /> Oficial
                          </Badge>
                        )}
                      </div>
                      {t.descricao && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-3 break-words">
                          {t.descricao}
                        </p>
                      )}
                    </div>
                    <Badge
                      className={
                        ativo
                          ? "bg-green-500/20 text-green-300 shrink-0"
                          : "bg-muted text-muted-foreground shrink-0"
                      }
                    >
                      {ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {t.categoria && (
                      <Badge variant="outline" className="text-[10px]">
                        {t.categoria}
                      </Badge>
                    )}
                    {t.updated_at && (
                      <span className="text-[10px] text-muted-foreground">
                        atualizado {formatDistanceToNow(new Date(t.updated_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={ativo}
                        onCheckedChange={(v) =>
                          toggle.mutate(
                            { id: t.id, ativo: v },
                            {
                              onSuccess: () =>
                                toast.success(v ? "Template ativado" : "Template desativado"),
                              onError: (e: any) => toast.error(e.message),
                            }
                          )
                        }
                      />
                      <span className="text-xs text-muted-foreground">
                        {ativo ? "Disponível no wizard" : "Oculto do wizard"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar"
                        onClick={() => setEditor({ open: true, template: t })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Duplicar"
                        onClick={() =>
                          setEditor({ open: true, template: t, duplicate: true })
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Exportar .flow.json"
                        onClick={() => handleExport(t)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Excluir"
                        onClick={() => {
                          if (confirm(`Excluir o template "${t.nome}"?`)) {
                            del.mutate(t.id, {
                              onSuccess: () => toast.success("Template excluído"),
                              onError: (e: any) => toast.error(e.message),
                            });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <TemplateEditorDialog
        state={editor}
        onClose={() => setEditor({ open: false, template: null })}
      />
    </Card>
  );
}

function TemplateEditorDialog({
  state,
  onClose,
}: {
  state: EditorState;
  onClose: () => void;
}) {
  const upsert = useUpsertFlowTemplate();
  const isEdit = !!state.template && !state.duplicate;

  const initial = state.template;
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [definicaoStr, setDefinicaoStr] = useState(EMPTY_DEF);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Reset form when dialog opens
  const formKey = `${state.open}-${initial?.id ?? "new"}-${state.duplicate ? "dup" : "src"}`;
  useMemo(() => {
    if (!state.open) return;
    setNome(initial ? (state.duplicate ? `${initial.nome} (cópia)` : initial.nome) : "");
    setDescricao(initial?.descricao ?? "");
    setCategoria(initial?.categoria ?? "");
    setAtivo(initial?.ativo ?? true);
    setDefinicaoStr(
      initial ? JSON.stringify(initial.definicao ?? {}, null, 2) : EMPTY_DEF
    );
    setJsonError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey]);

  const validateJson = (txt: string) => {
    try {
      JSON.parse(txt);
      setJsonError(null);
      return true;
    } catch (e: any) {
      setJsonError(e.message);
      return false;
    }
  };

  const onSave = () => {
    if (!nome.trim()) {
      toast.error("Informe o nome do template");
      return;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(definicaoStr);
    } catch (e: any) {
      toast.error(`JSON inválido: ${e.message}`);
      return;
    }
    upsert.mutate(
      {
        id: isEdit ? initial!.id : undefined,
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        categoria: categoria.trim() || null,
        definicao: parsed,
        ativo,
        is_global: true,
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? "Template atualizado" : "Template salvo");
          onClose();
        },
        onError: (e: any) => toast.error(e.message),
      }
    );
  };

  return (
    <Dialog open={state.open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar template" : state.duplicate ? "Duplicar template" : "Novo template"}
          </DialogTitle>
          <DialogDescription>
            Templates ativos aparecem no wizard "Novo Fluxo" para todos os tenants.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Nome *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <Label>Categoria</Label>
              <Input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Ex.: Lead, WhatsApp, Tarefa..."
              />
            </div>
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={ativo} onCheckedChange={setAtivo} />
            <span className="text-sm">{ativo ? "Ativo" : "Inativo"}</span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Definição (JSON)</Label>
              {jsonError ? (
                <span className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {jsonError}
                </span>
              ) : (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> JSON válido
                </span>
              )}
            </div>
            <Textarea
              value={definicaoStr}
              onChange={(e) => {
                setDefinicaoStr(e.target.value);
                validateJson(e.target.value);
              }}
              rows={16}
              className="font-mono text-xs"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Estrutura esperada: <code>trigger_type</code>, <code>trigger_config</code>,
              <code> condicoes</code>, <code>actions[]</code>.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={onSave}
            disabled={upsert.isPending || !!jsonError}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {upsert.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
