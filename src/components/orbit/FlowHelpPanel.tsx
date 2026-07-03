import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";

const STORAGE_KEY = "orbit:flow-help-open";

export function FlowHelpPanel() {
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "1") setOpen(true);
    } catch {}
  }, []);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  return (
    <Card className="glass-card border-brand/20">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-brand" />
            Como configurar Fluxos
          </CardTitle>
          <CardDescription>
            Guia rápido: gatilho → condições → ações, e como vincular ao Pipeline.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={toggle} className="shrink-0">
          {open ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" /> Ocultar
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-1" /> Mostrar
            </>
          )}
        </Button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {/* Diagrama dos 3 blocos */}
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-mono">
              <Badge className="bg-brand/20 text-brand border-brand/30">GATILHO</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">CONDIÇÕES</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge className="bg-green-500/20 text-green-300 border-green-500/30">AÇÕES em sequência</Badge>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground mt-1">
              <span>quando</span>
              <span>·</span>
              <span>para quem</span>
              <span>·</span>
              <span>o que fazer</span>
            </div>
          </div>

          <Accordion type="single" collapsible defaultValue="gatilho" className="w-full">
            <AccordionItem value="gatilho">
              <AccordionTrigger className="text-sm">1. Escolhendo o Gatilho (quando dispara)</AccordionTrigger>
              <AccordionContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Ao criar um fluxo, escolha um template pronto ou "em branco". Cada fluxo tem <b>1 gatilho</b>:
                </p>
                <ul className="space-y-1 text-xs">
                  <li><code className="text-brand">lead_recebido</code> — chegou lead externo (webhook, Typebot, planilha, form)</li>
                  <li><code className="text-brand">prospect_qualified</code> — IA marcou o prospect como qualificado</li>
                  <li><code className="text-brand">deal_stage_changed</code> — deal mudou de etapa no funil</li>
                  <li><code className="text-brand">deal_idle</code> — deal parado há X dias na etapa</li>
                  <li><code className="text-brand">conversa_no_reply</code> — lead sem resposta há X horas</li>
                  <li><code className="text-brand">meeting_reminder_24h</code> / <code className="text-brand">_1h</code> — antes de reunião agendada</li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  O <b>Mapa de Disparo</b> abaixo mostra quantos fluxos escutam cada gatilho e permite injetar um evento sintético de teste.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="condicoes">
              <AccordionTrigger className="text-sm">2. Filtrando com Condições (ícone de funil no fluxo)</AccordionTrigger>
              <AccordionContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">Filtra <b>para quem</b> o fluxo se aplica. Combináveis:</p>
                <ul className="space-y-1 text-xs list-disc pl-5">
                  <li><b>Fonte de lead</b>: só leads do Typebot X, ou tipo <code>google_sheets</code></li>
                  <li><b>Exigir telefone/email/documento</b>: descarta leads incompletos</li>
                  <li><b>Apenas leads novos</b>: ignora merges/duplicados</li>
                  <li>
                    <b>Payload match</b>: chaves customizadas do webhook. Ex: chave{" "}
                    <code>raw.utm_source</code> valor <code>instagram, facebook</code> (múltiplos separados por vírgula)
                  </li>
                </ul>
                <p className="text-xs text-amber-400">
                  Sem condições = dispara para TODOS os eventos daquele gatilho.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="acoes">
              <AccordionTrigger className="text-sm">3. Ações e vínculo com o Pipeline (ícone de lista)</AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Sequência ordenada. Cada ação tem <b>atraso em segundos</b> antes de executar. Catálogo:
                </p>
                <ul className="space-y-1 text-xs list-disc pl-5">
                  <li><b>Enviar template WhatsApp</b> — usa template salvo (<code>template_slug</code>)</li>
                  <li><b>Enviar mídia</b> — PDF, áudio, vídeo, imagem por URL pública</li>
                  <li><b>Agendamento inteligente</b> — consulta Google Calendar e oferece horários</li>
                  <li><b>Espera / Atraso</b> — pausa X min/horas antes da próxima ação</li>
                  <li><b>Mover no funil</b> ⭐ — vincula ao pipeline, muda etapa do deal (use <code>to_stage_slug</code>)</li>
                  <li><b>Criar tarefa</b> — follow-up para o vendedor com prazo em dias</li>
                  <li><b>Ligar/Desligar IA</b> — alterna IA ↔ humano na conversa</li>
                  <li><b>Notificar vendedor</b> — alerta por email ou WhatsApp</li>
                </ul>

                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                  <div className="text-xs font-semibold text-brand">Vínculo com o Pipeline — 2 padrões</div>
                  <div className="text-xs">
                    <b>A) Pipeline → dispara Fluxo</b> (reativo)
                    <br />
                    Gatilho <code>deal_stage_changed</code> + condição <code>raw.to_stage_slug = proposta-enviada</code>{" "}
                    + ação enviar PDF + criar tarefa.
                  </div>
                  <div className="text-xs">
                    <b>B) Fluxo → move no Pipeline</b> (proativo)
                    <br />
                    Gatilho <code>prospect_qualified</code> + ação <b>Mover no funil</b> com{" "}
                    <code>to_stage_slug</code> da etapa alvo.
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Os slugs das etapas você vê em <b>Config → Pipeline</b>. Prefira sempre{" "}
                    <code>to_stage_slug</code> (estável) em vez de <code>to_stage_id</code> (UUID).
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="fluxo-mental">
              <AccordionTrigger className="text-sm">4. Passo a passo para criar do zero</AccordionTrigger>
              <AccordionContent className="text-sm">
                <ol className="space-y-1 text-xs list-decimal pl-5">
                  <li>"Que evento do CRM deve acionar isto?" → escolha o gatilho</li>
                  <li>"Para quais leads/deals?" → preencha as condições</li>
                  <li>Desenhe a sequência com atrasos (ex: 0s boas-vindas → 300s PDF → 3600s tarefa)</li>
                  <li>Deixe <b>INATIVO</b>, use <b>Testar</b> no Mapa de Disparo → confira Histórico (relógio)</li>
                  <li>Ative com o switch verde</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex items-start gap-2 rounded-md border border-brand/30 bg-brand/5 p-3 text-xs">
            <Lightbulb className="h-4 w-4 text-brand shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-brand">Dicas rápidas</div>
              <ul className="space-y-0.5 text-muted-foreground list-disc pl-4">
                <li>Sempre crie o fluxo inativo e teste pelo Mapa de Disparo antes de ativar.</li>
                <li>Prefira <code>to_stage_slug</code> em "Mover no funil" — sobrevive a mudanças de UUID.</li>
                <li>Use "Espera" entre ações para não parecer bot (ex: 30s entre mensagens).</li>
                <li>Veja o Histórico de cada fluxo para depurar erros das últimas 20 execuções.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
