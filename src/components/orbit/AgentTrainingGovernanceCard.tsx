import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FlaskConical, History, Loader2, RotateCcw, Save, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { AGENT_SANDBOX_SCENARIOS } from "@/lib/agent-sandbox-review";
import {
  countCurrentTrainingApprovals,
  isTrainingDraftPublished,
} from "@/lib/agent-training-governance";
import { useAgentTrainingAction, useAgentTrainingGovernance } from "@/hooks/useAgentTrainingGovernance";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

interface AgentTrainingGovernanceCardProps {
  tenantSlug?: string | null;
  onOpenSandbox: () => void;
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("TRAINING_APPROVALS_INCOMPLETE")) return "Aprove os cinco cenários deste rascunho antes de publicar.";
  if (message.includes("TRAINING_DRAFT_CHANGED")) return "O rascunho mudou. Reabra a sandbox e valide a versão atual.";
  if (message.includes("TENANT_ADMIN_REQUIRED")) return "Somente um administrador deste cliente pode fazer esta alteração.";
  return message || "Não foi possível concluir a operação.";
}

export function AgentTrainingGovernanceCard({ tenantSlug, onOpenSandbox }: AgentTrainingGovernanceCardProps) {
  const query = useAgentTrainingGovernance(tenantSlug);
  const action = useAgentTrainingAction(tenantSlug);
  const state = query.data;
  const [content, setContent] = useState("");
  const [changelog, setChangelog] = useState("");

  useEffect(() => {
    if (state?.draft) setContent(state.draft.content);
  }, [state?.draft]);

  const approvedCount = countCurrentTrainingApprovals(state);
  const requiredCount = state?.required_scenarios.length ?? AGENT_SANDBOX_SCENARIOS.length;
  const draftPublished = isTrainingDraftPublished(state);
  const localChanged = content !== (state?.draft?.content ?? "");
  const canPublish = Boolean(
    state?.can_publish &&
      !draftPublished &&
      state.draft?.fingerprint &&
      approvedCount === requiredCount &&
      changelog.trim() &&
      !localChanged,
  );
  const reviewedScenarios = useMemo(
    () => new Map((state?.reviews ?? []).map((review) => [review.scenario_key, review])),
    [state?.reviews],
  );

  if (!state?.enabled) return null;

  const run = async (input: Parameters<typeof action.mutateAsync>[0], success: string) => {
    try {
      await action.mutateAsync(input);
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(friendlyError(error));
      return false;
    }
  };

  return (
    <Card className="border-primary/25">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle>Treinamento de conversão</CardTitle>
              <Badge variant={draftPublished ? "default" : "secondary"}>
                {draftPublished ? `Publicado v${state.active?.version_number ?? 1}` : "Rascunho não publicado"}
              </Badge>
            </div>
            <CardDescription>
              Ajuste linguagem, objeções e chamadas para ação. Preços, identidade, pagamento e regras críticas continuam protegidos pelo Orbit.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" className="gap-2" onClick={onOpenSandbox} disabled={localChanged}>
            <FlaskConical className="h-4 w-4" /> Testar rascunho
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="conversion-guidance">Orientações de conversão</Label>
          <Textarea
            id="conversion-guidance"
            className="min-h-48"
            value={content}
            disabled={!state.can_edit || action.isPending}
            maxLength={12000}
            onChange={(event) => setContent(event.target.value)}
            placeholder={"Exemplos:\n- Antes de apresentar uma oferta, confirme o objetivo do lead.\n- Ao explicar valor, priorize benefícios concretos e faça apenas uma pergunta.\n- Evite a expressão X; prefira Y."}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Este conteúdo orienta a conversa, mas nunca substitui as travas do sistema.</span>
            <span>{content.length}/12000</span>
          </div>
          {localChanged && (
            <p className="text-xs text-amber-600">Salve o rascunho antes de abrir a sandbox. Uma alteração invalida aprovações anteriores.</p>
          )}
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={!state.can_edit || action.isPending || !localChanged}
            onClick={() => void run({ action: "save_draft", content }, "Rascunho salvo sem alterar a produção.")}
          >
            {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar rascunho
          </Button>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Homologação obrigatória</p>
              <p className="text-xs text-muted-foreground">As aprovações pertencem ao fingerprint deste rascunho.</p>
            </div>
            <Badge variant={approvedCount === requiredCount ? "default" : "outline"}>{approvedCount}/{requiredCount}</Badge>
          </div>
          <Progress value={requiredCount ? (approvedCount / requiredCount) * 100 : 0} className="h-2" />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {AGENT_SANDBOX_SCENARIOS.map((scenario) => {
              const review = reviewedScenarios.get(scenario.key);
              return (
                <div key={scenario.key} className="rounded-md border px-3 py-2 text-xs">
                  <div className="flex items-center gap-1.5 font-medium">
                    {review?.status === "approved" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                    {scenario.title}
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {review?.status === "approved" ? "Aprovado" : review?.status === "rejected" ? "Reprovado" : "Pendente"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {!draftPublished && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Versão ativa</Label>
              <Textarea readOnly className="min-h-36 bg-muted/40 text-xs" value={state.active?.content ?? ""} />
            </div>
            <div className="space-y-2">
              <Label>Rascunho candidato</Label>
              <Textarea readOnly className="min-h-36 bg-muted/40 text-xs" value={state.draft?.content ?? ""} />
            </div>
          </div>
        )}

        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-2">
            <Label htmlFor="training-changelog">Motivo da publicação</Label>
            <Input
              id="training-changelog"
              value={changelog}
              maxLength={1000}
              disabled={!state.can_publish || action.isPending}
              onChange={(event) => setChangelog(event.target.value)}
              placeholder="Ex.: abordagem mais consultiva e preço somente após explicação de valor"
            />
          </div>
          <Button
            type="button"
            className="gap-2"
            disabled={!canPublish || action.isPending}
            onClick={() => state.draft && void (async () => {
              const published = await run(
                { action: "publish", draftFingerprint: state.draft.fingerprint, changelog },
                "Nova versão publicada com auditoria e rollback disponível.",
              );
              if (published) setChangelog("");
            })()}
          >
            {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Publicar versão aprovada
          </Button>
          {!canPublish && (
            <p className="text-xs text-muted-foreground">Para publicar: salve o rascunho, aprove os cinco cenários e informe o motivo da mudança.</p>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="flex items-center gap-2 font-medium"><History className="h-4 w-4" /> Histórico e rollback</h3>
          {state.versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma versão publicada.</p>
          ) : state.versions.map((version) => (
            <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="font-medium">v{version.version_number} {version.is_active && <Badge className="ml-2">Ativa</Badge>}</p>
                <p className="text-sm text-muted-foreground">{version.changelog}</p>
                <p className="text-xs text-muted-foreground">{new Date(version.published_at).toLocaleString("pt-BR")}</p>
              </div>
              {!version.is_active && state.can_publish && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" size="sm" variant="outline" className="gap-2" disabled={action.isPending}>
                      <RotateCcw className="h-4 w-4" /> Restaurar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Restaurar a versão v{version.version_number}?</AlertDialogTitle>
                      <AlertDialogDescription>O rollback é imediato, restrito a este tenant e será registrado na auditoria.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void run({ action: "rollback", versionId: version.id }, `Versão v${version.version_number} restaurada.`)}>Confirmar rollback</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
