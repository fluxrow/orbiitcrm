import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  ExternalLink,
  Webhook,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useOrbitLeadSources,
  useCreateLeadSource,
  useUpdateLeadSource,
  useDeleteLeadSource,
  useRotateLeadSourceToken,
  buildLeadIngestEndpoint,
  LEAD_SOURCE_TYPES,
  FIELD_MAPPING_TARGETS,
  type OrbitLeadSource,
} from "@/hooks/useOrbitLeadSources";
import { LeadSourceTutorialDialog, type TutorialKind } from "./LeadSourceTutorialDialog";

function copyToClipboard(value: string, label: string) {
  navigator.clipboard.writeText(value);
  toast.success(`${label} copiado!`);
}

export function LeadSourcesTab({ empresaId }: { empresaId: string | null | undefined }) {
  const { data: sources, isLoading } = useOrbitLeadSources(empresaId);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<OrbitLeadSource | null>(null);
  const [tutorial, setTutorial] = useState<TutorialKind | null>(null);
  const toggle = useUpdateLeadSource();
  const del = useDeleteLeadSource();

  if (!empresaId) {
    return (
      <div className="text-sm text-muted-foreground">
        Selecione uma empresa para configurar fontes de lead.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            Como funciona
          </CardTitle>
          <CardDescription>
            Cada Fonte gera um endpoint único e um token. Configure no Typebot, Google Sheets (Apps
            Script) ou outro sistema para enviar leads via HTTP POST. O lead nasce em Prospects e
            dispara o evento <code className="text-xs">lead_recebido</code> no Motor de Fluxos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/orbit/docs/lead-sources/typebot" target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Tutorial Typebot
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/orbit/docs/lead-sources/google-sheets" target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Tutorial Google Sheets
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/orbit/docs/lead-sources/webhook" target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Webhook genérico
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-primary" />
              Fontes de Lead
            </CardTitle>
            <CardDescription>
              Cadastre as origens externas que vão alimentar seu CRM automaticamente.
            </CardDescription>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova Fonte
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : !sources || sources.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Webhook className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhuma fonte cadastrada ainda.</p>
              <p className="text-xs mt-1">
                Crie sua primeira fonte para começar a receber leads externos.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sources.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-md border border-border bg-card/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{s.nome}</span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {s.tipo.replace("_", " ")}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        id: {s.id.slice(0, 8)}…
                      </Badge>
                      {s.total_received > 0 && (
                        <Badge className="text-xs bg-green-500/20 text-green-300 border-green-500/30">
                          {s.total_received} recebidos
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.last_received_at
                        ? `Último lead ${formatDistanceToNow(new Date(s.last_received_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}`
                        : "Aguardando o primeiro lead"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={s.ativo}
                      onCheckedChange={(v) =>
                        toggle.mutate(
                          { id: s.id, patch: { ativo: v } },
                          {
                            onSuccess: () =>
                              toast.success(v ? "Fonte ativada" : "Fonte pausada"),
                          }
                        )
                      }
                    />
                    <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
                      Configurar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Excluir a fonte "${s.nome}"? Esta ação é irreversível.`)) {
                          del.mutate(s.id, {
                            onSuccess: () => toast.success("Fonte excluída"),
                          });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateLeadSourceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        empresaId={empresaId}
        onCreated={(s) => setEditing(s)}
      />
      <LeadSourceEditorDialog source={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CreateLeadSourceDialog({
  open,
  onOpenChange,
  empresaId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  empresaId: string;
  onCreated: (s: OrbitLeadSource) => void;
}) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<string>("typebot");
  const create = useCreateLeadSource();

  const handleCreate = () => {
    if (!nome.trim()) {
      toast.error("Dê um nome para a fonte");
      return;
    }
    create.mutate(
      {
        empresa_id: empresaId,
        nome: nome.trim(),
        tipo,
        // Mapeamento default baseado no tipo
        field_mapping:
          tipo === "typebot"
            ? { nome: "full_name", telefone: "phone", email: "email_addr", documento: "cpf" }
            : { nome: "nome", telefone: "telefone", email: "email", documento: "documento" },
      },
      {
        onSuccess: (s) => {
          toast.success("Fonte criada! Configure o mapeamento e copie o endpoint.");
          setNome("");
          setTipo("typebot");
          onOpenChange(false);
          if (s) onCreated(s);
        },
        onError: (e: any) => toast.error(`Erro: ${e.message}`),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Fonte de Lead</DialogTitle>
          <DialogDescription>
            Crie uma origem externa. Você poderá ajustar o mapeamento de campos depois.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome da fonte</Label>
            <Input
              placeholder="Ex.: Typebot - Site Institucional"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleCreate}
            disabled={create.isPending}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {create.isPending ? "Criando..." : "Criar fonte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadSourceEditorDialog({
  source,
  onClose,
}: {
  source: OrbitLeadSource | null;
  onClose: () => void;
}) {
  const update = useUpdateLeadSource();
  const rotate = useRotateLeadSourceToken();
  const [showToken, setShowToken] = useState(false);
  const [nome, setNome] = useState(source?.nome ?? "");
  const [mapping, setMapping] = useState<Record<string, string>>(
    (source?.field_mapping as Record<string, string>) ?? {}
  );

  // resincroniza quando troca de source
  useMemo(() => {
    if (source) {
      setNome(source.nome);
      setMapping((source.field_mapping as Record<string, string>) ?? {});
    }
  }, [source?.id]);

  if (!source) return null;

  const endpoint = buildLeadIngestEndpoint(source.id);
  const curlExample = `curl -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "x-source-token: ${source.secret_token}" \\
  -d '${JSON.stringify(
    Object.fromEntries(
      Object.entries(mapping).map(([target, src]) => [src || target, `<${target}>`])
    ),
    null,
    0
  )}'`;

  const mappingComplete = ["nome", "telefone", "email", "documento"].some((k) => mapping[k]);

  return (
    <Dialog open={!!source} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar fonte</DialogTitle>
          <DialogDescription>
            Copie o endpoint e o token para o sistema externo (Typebot, Apps Script, etc).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Endpoint (POST)
              <Badge variant="outline" className="text-[10px]">
                público — protegido por token
              </Badge>
            </Label>
            <div className="flex gap-2">
              <Input value={endpoint} readOnly className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(endpoint, "Endpoint")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Secret Token (header <code className="text-xs">x-source-token</code>)
            </Label>
            <div className="flex gap-2">
              <Input
                type={showToken ? "text" : "password"}
                value={source.secret_token}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowToken((v) => !v)}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(source.secret_token, "Token")}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="Rotacionar token (invalida o atual)"
                onClick={() => {
                  if (
                    confirm(
                      "Rotacionar o token vai invalidar o atual. Você precisará atualizar o sistema externo. Continuar?"
                    )
                  ) {
                    rotate.mutate(source.id, {
                      onSuccess: () => toast.success("Token rotacionado"),
                    });
                  }
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mapeamento de campos</Label>
            <p className="text-xs text-muted-foreground">
              Mapeie o campo do CRM para a chave do payload enviado. Deixe vazio para usar o nome
              padrão.
            </p>
            <div className="space-y-2">
              {FIELD_MAPPING_TARGETS.map((target) => (
                <div key={target} className="grid grid-cols-[120px_1fr] gap-2 items-center">
                  <Label className="text-xs font-mono">{target}</Label>
                  <Input
                    placeholder={`chave no payload (ex.: ${target})`}
                    value={mapping[target] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [target]: e.target.value }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs mt-2">
              {mappingComplete ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-green-400">
                    Pelo menos um identificador (nome/telefone/email/documento) mapeado.
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-amber-400">
                    Mapeie ao menos um de: nome, telefone, email ou documento.
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Exemplo de chamada (curl)
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(curlExample, "Comando curl")}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copiar
              </Button>
            </Label>
            <pre className="text-[11px] bg-muted/40 border border-border rounded-md p-3 overflow-x-auto whitespace-pre-wrap font-mono">
              {curlExample}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={() =>
              update.mutate(
                { id: source.id, patch: { nome, field_mapping: mapping } },
                {
                  onSuccess: () => {
                    toast.success("Fonte atualizada");
                    onClose();
                  },
                  onError: (e: any) => toast.error(`Erro: ${e.message}`),
                }
              )
            }
            disabled={update.isPending || !nome.trim()}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {update.isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
