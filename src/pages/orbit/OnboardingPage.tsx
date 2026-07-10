import { useState } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Copy, Mail, ExternalLink, Archive, Plus, Eye, ClipboardList, Download } from "lucide-react";
import { toast } from "sonner";
import {
  useClientOnboardings,
  useCreateOnboarding,
  useArchiveOnboarding,
  useUpdateChecklist,
  ClientOnboarding,
} from "@/hooks/useOrbitOnboarding";
import {
  ONBOARDING_SECTIONS,
  ALL_KNOWN_SECTIONS,
  calculateProgress,
  DEFAULT_CHECKLIST,
  buildImplementationPackageMarkdown,
} from "@/lib/onboarding-sections";
import { Switch } from "@/components/ui/switch";

const STATUS_LABEL: Record<string, { label: string; variant: any }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  enviado: { label: "Enviado", variant: "default" },
  em_andamento: { label: "Em andamento", variant: "default" },
  concluido: { label: "Concluído", variant: "default" },
  revisado: { label: "Revisado", variant: "default" },
  arquivado: { label: "Arquivado", variant: "outline" },
};

export default function OnboardingPage() {
  const { data: list, isLoading } = useClientOnboardings();
  const [newOpen, setNewOpen] = useState(false);
  const [detailOf, setDetailOf] = useState<ClientOnboarding | null>(null);

  const active = (list ?? []).filter((o) => !o.archived);

  return (
    <OrbitLayout>
      <PageHeader
        title="Onboarding de clientes"
        description="Envie um link para o cliente preencher antes da call de kick-off."
        action={
          <Button onClick={() => setNewOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Novo onboarding
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : active.length === 0 ? (
        <Card className="glass-card p-12 text-center">
          <ClipboardList className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold text-lg mb-1">Nenhum onboarding ainda</h3>
          <p className="text-muted-foreground mb-4">
            Crie um onboarding para enviar ao cliente antes da implantação.
          </p>
          <Button onClick={() => setNewOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Criar primeiro onboarding
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {active.map((o) => (
            <OnboardingRow key={o.id} onboarding={o} onOpen={() => setDetailOf(o)} />
          ))}
        </div>
      )}

      <NewOnboardingDialog open={newOpen} onOpenChange={setNewOpen} />
      <OnboardingDetailSheet
        onboarding={detailOf}
        onClose={() => setDetailOf(null)}
      />
    </OrbitLayout>
  );
}

function OnboardingRow({ onboarding, onOpen }: { onboarding: ClientOnboarding; onOpen: () => void }) {
  const archive = useArchiveOnboarding();
  const progress = calculateProgress(onboarding.responses);
  const link = `${window.location.origin}/onboarding-cliente/${onboarding.public_token}`;
  const st = STATUS_LABEL[onboarding.status] || STATUS_LABEL.rascunho;

  return (
    <Card className="glass-card p-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h4 className="font-semibold truncate">{onboarding.cliente_nome || "Sem nome"}</h4>
          <Badge variant={st.variant}>{st.label}</Badge>
          {onboarding.empresa?.nome && (
            <Badge variant="outline" className="text-[10px]">
              {onboarding.empresa.nome}
              {onboarding.empresa.slug ? ` · /${onboarding.empresa.slug}` : ""}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {onboarding.cliente_email} · {onboarding.cliente_empresa || "—"}
        </p>
        <div className="flex items-center gap-3 mt-2">
          <Progress value={progress} className="h-1.5 flex-1 max-w-[200px]" />
          <span className="text-xs text-muted-foreground">{progress}% preenchido</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline" size="sm" className="gap-1.5"
          onClick={() => {
            navigator.clipboard.writeText(link);
            toast.success("Link copiado");
          }}
        >
          <Copy className="w-3.5 h-3.5" /> Copiar link
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onOpen}>
          <Eye className="w-3.5 h-3.5" /> Ver
        </Button>
        <Button
          variant="ghost" size="icon"
          onClick={() => archive.mutate(onboarding.id, { onSuccess: () => toast.success("Arquivado") })}
        >
          <Archive className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}

function NewOnboardingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [empresaNome, setEmpresaNome] = useState("");
  const [slug, setSlug] = useState("");
  const [mensalidade, setMensalidade] = useState("1200");
  const [implementacao, setImplementacao] = useState("3000");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [dryRunEmail, setDryRunEmail] = useState(false);
  const create = useCreateOnboarding();

  const submit = () => {
    if (!empresaNome || !nome || !email) {
      toast.error("Empresa, nome do contato e email são obrigatórios");
      return;
    }
    const monthly = Math.round(parseFloat((mensalidade || "0").replace(",", ".")) * 100) || undefined;
    const setup = Math.round(parseFloat((implementacao || "0").replace(",", ".")) * 100) || undefined;
    create.mutate(
      {
        empresa_nome: empresaNome,
        slug: slug || undefined,
        monthly_price_cents: monthly,
        setup_fee_cents: setup,
        cliente_nome: nome,
        cliente_email: email,
        cliente_empresa: empresaNome,
        notes,
        dry_run_email: dryRunEmail,
      },
      {
        onSuccess: (res) => {
          const skipped = (res as any).email_skipped_reason;
          toast.success(
            res.email_sent
              ? `Empresa "${res.empresa_nome}" criada e email enviado`
              : skipped === "dry_run"
                ? `Onboarding criado em modo smoke (email não enviado) — link copiado`
                : `Empresa criada (email falhou — link copiado)`,
          );
          navigator.clipboard.writeText(res.public_link).catch(() => null);
          setEmpresaNome(""); setSlug(""); setMensalidade("1200"); setImplementacao("3000");
          setNome(""); setEmail(""); setNotes(""); setDryRunEmail(false);
          onOpenChange(false);
        },
        onError: (e: any) => toast.error(e?.message || "Erro ao criar"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo onboarding</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Cria um novo tenant para o cliente, envia o link de onboarding e prepara o ambiente Orbit.
          </p>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Empresa do cliente *</Label>
            <Input value={empresaNome} onChange={(e) => setEmpresaNome(e.target.value)} placeholder="Ex: Acme S.A." />
          </div>
          <div>
            <Label>Slug do tenant (opcional)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme (gera automático se vazio)" />
            <p className="text-[11px] text-muted-foreground mt-1">URL final: orbit.fluxrow.pro/{slug || "<gerado>"}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mensalidade (R$)</Label>
              <Input value={mensalidade} onChange={(e) => setMensalidade(e.target.value)} placeholder="1200" />
            </div>
            <div>
              <Label>Implementação (R$)</Label>
              <Input value={implementacao} onChange={(e) => setImplementacao(e.target.value)} placeholder="3000" />
            </div>
          </div>
          <div>
            <Label>Nome do contato *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Maria Souza" />
          </div>
          <div>
            <Label>Email do contato *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@empresa.com" />
          </div>
          <div>
            <Label>Observações internas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 p-3">
            <div>
              <Label className="text-sm">Modo smoke (não enviar email)</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Cria o onboarding e retorna o link, mas não dispara nada pelo Resend. Use para testes.
              </p>
            </div>
            <Switch checked={dryRunEmail} onCheckedChange={setDryRunEmail} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending} className="gap-2">
            <Mail className="w-4 h-4" />
            {create.isPending ? "Enviando…" : dryRunEmail ? "Criar (sem email)" : "Criar tenant e enviar email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OnboardingDetailSheet({
  onboarding, onClose,
}: { onboarding: ClientOnboarding | null; onClose: () => void }) {
  const updateChecklist = useUpdateChecklist();

  if (!onboarding) return null;
  const checklist =
    onboarding.implementation_checklist?.length > 0
      ? onboarding.implementation_checklist
      : DEFAULT_CHECKLIST;

  const toggle = (idx: number) => {
    const next = checklist.map((c: any, i: number) => (i === idx ? { ...c, done: !c.done } : c));
    updateChecklist.mutate({ id: onboarding.id, checklist: next });
  };

  const link = `${window.location.origin}/onboarding-cliente/${onboarding.public_token}`;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{onboarding.cliente_nome}</SheetTitle>
          <p className="text-sm text-muted-foreground">{onboarding.cliente_email}</p>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href={link} target="_blank" rel="noreferrer">
                <ExternalLink className="w-3.5 h-3.5" /> Abrir wizard do cliente
              </a>
            </Button>
            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado"); }}
            >
              <Copy className="w-3.5 h-3.5" /> Copiar link
            </Button>
            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={async () => {
                const md = buildImplementationPackageMarkdown({
                  onboarding,
                  checklist,
                  publicLink: link,
                });
                const safe = (onboarding.empresa?.slug || onboarding.cliente_empresa || onboarding.cliente_nome || "onboarding")
                  .toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `implantacao-${safe}-${new Date().toISOString().slice(0,10)}.md`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                try {
                  await navigator.clipboard.writeText(md);
                  toast.success("Pacote gerado — .md baixado e copiado");
                } catch {
                  toast.success("Pacote gerado — .md baixado");
                }
              }}
            >
              <Download className="w-3.5 h-3.5" /> Gerar pacote de implantação
            </Button>
          </div>

          <section>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <ClipboardList className="w-4 h-4" /> Checklist de implementação
            </h3>
            <div className="space-y-2">
              {checklist.map((item: any, idx: number) => (
                <label key={item.key} className="flex items-center gap-3 p-2 rounded hover:bg-muted/40 cursor-pointer">
                  <Checkbox checked={!!item.done} onCheckedChange={() => toggle(idx)} />
                  <span className={item.done ? "line-through text-muted-foreground" : ""}>{item.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-3">Respostas do cliente</h3>
            {Object.keys(onboarding.responses ?? {}).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ainda sem respostas. {onboarding.status === "enviado" ? "Aguardando o cliente preencher." : ""}
              </p>
            ) : (
              <div className="space-y-4">
                {ONBOARDING_SECTIONS.map((sec) => {
                  const vals = onboarding.responses?.[sec.key];
                  if (!vals || Object.keys(vals).length === 0) return null;
                  return (
                    <div key={sec.key} className="border rounded-lg p-3">
                      <h4 className="font-medium text-sm mb-2">{sec.title}</h4>
                      <dl className="space-y-1.5 text-sm">
                        {sec.fields.map((f) => {
                          const v = vals[f.key];
                          if (!v) return null;
                          return (
                            <div key={f.key} className="grid grid-cols-[140px_1fr] gap-2">
                              <dt className="text-muted-foreground">{f.label}</dt>
                              <dd className="whitespace-pre-wrap">{String(v)}</dd>
                            </div>
                          );
                        })}
                      </dl>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function buildImplantacaoMarkdown(
  o: ClientOnboarding,
  checklist: any[],
  link: string,
): string {
  const lines: string[] = [];
  const empresa = o.empresa?.nome ?? o.cliente_empresa ?? "—";
  const slug = o.empresa?.slug ? `/${o.empresa.slug}` : "";
  lines.push(`# Pacote de implantação — ${empresa}${slug}`);
  lines.push("");
  lines.push(`- **Cliente:** ${o.cliente_nome ?? "—"} (${o.cliente_email ?? "—"})`);
  lines.push(`- **Status:** ${o.status}`);
  lines.push(`- **Progresso:** ${calculateProgress(o.responses)}%`);
  lines.push(`- **Link do wizard:** ${link}`);
  lines.push(`- **Gerado em:** ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## Respostas do cliente");
  lines.push("");
  const responses = o.responses ?? {};
  if (Object.keys(responses).length === 0) {
    lines.push("_Nenhuma resposta preenchida ainda._");
    lines.push("");
  } else {
    for (const sec of ONBOARDING_SECTIONS) {
      const vals = (responses as any)?.[sec.key];
      if (!vals || Object.keys(vals).length === 0) continue;
      lines.push(`### ${sec.title}`);
      lines.push("");
      for (const f of sec.fields) {
        const v = vals[f.key];
        if (v === undefined || v === null || String(v).trim() === "") continue;
        lines.push(`- **${f.label}:** ${String(v).replace(/\n/g, "\n  ")}`);
      }
      lines.push("");
    }
  }

  lines.push("## Checklist de implementação");
  lines.push("");
  for (const item of checklist) {
    lines.push(`- [${item.done ? "x" : " "}] ${item.label}`);
  }
  lines.push("");
  return lines.join("\n");
}
