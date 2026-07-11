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
import { Copy, Mail, ExternalLink, Archive, Plus, Eye, ClipboardList, Download, Loader2 } from "lucide-react";
import { useSignedOrbitMedia } from "@/lib/orbit-media";
import { toast } from "sonner";
import {
  useClientOnboardings,
  useCreateOnboarding,
  useArchiveOnboarding,
  useUpdateChecklist,
  ClientOnboarding,
} from "@/hooks/useOrbitOnboarding";
import {
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
                {ALL_KNOWN_SECTIONS.map((sec) => {
                  const vals = onboarding.responses?.[sec.key];
                  if (!vals || Object.keys(vals).length === 0) return null;
                  const knownKeys = new Set(sec.fields.map((f) => f.key));
                  const unknownEntries = Object.entries(vals).filter(([k]) => !knownKeys.has(k));
                  return (
                    <div key={sec.key} className="border rounded-lg p-3">
                      <h4 className="font-medium text-sm mb-2">{sec.title}</h4>
                      <dl className="space-y-1.5 text-sm">
                        {sec.fields.map((f) => {
                          const v = vals[f.key];
                          if (v === undefined || v === null || v === "") return null;
                          if (Array.isArray(v) && v.length === 0) return null;
                          return (
                            <div key={f.key} className="grid grid-cols-[160px_1fr] gap-2">
                              <dt className="text-muted-foreground">{f.label}</dt>
                              <dd className="whitespace-pre-wrap"><ResponseValue value={v} /></dd>
                            </div>
                          );
                        })}
                        {unknownEntries.map(([k, v]) => (
                          <div key={k} className="grid grid-cols-[160px_1fr] gap-2 opacity-70">
                            <dt className="text-muted-foreground italic">{k}</dt>
                            <dd className="whitespace-pre-wrap"><ResponseValue value={v} /></dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  );
                })}
                {Object.entries(onboarding.responses ?? {}).map(([secKey, vals]: [string, any]) => {
                  if (ALL_KNOWN_SECTIONS.some((s) => s.key === secKey)) return null;
                  if (!vals || Object.keys(vals).length === 0) return null;
                  return (
                    <div key={secKey} className="border border-dashed rounded-lg p-3 opacity-70">
                      <h4 className="font-medium text-sm mb-2 italic">[Legado] {secKey}</h4>
                      <dl className="space-y-1.5 text-sm">
                        {Object.entries(vals).map(([k, v]) => (
                          <div key={k} className="grid grid-cols-[160px_1fr] gap-2">
                            <dt className="text-muted-foreground italic">{k}</dt>
                            <dd className="whitespace-pre-wrap"><ResponseValue value={v} /></dd>
                          </div>
                        ))}
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

function ResponseValue({ value }: { value: any }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <>{String(value)}</>;
  }
  // Lista estruturada de materiais / arrays de objetos
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">—</span>;
    const isMaterials = value.every((v) => v && typeof v === "object" && ("titulo" in v || "tipo" in v || "asset_id" in v));
    if (isMaterials) {
      return (
        <ul className="space-y-1.5">
          {value.map((m: any, i: number) => (
            <li key={m?.id ?? i} className="rounded border border-border/60 bg-muted/20 p-2 text-xs space-y-1">
              <div className="font-medium text-foreground">
                [{m?.tipo || "Material"}] {m?.titulo || m?.filename || "(sem título)"}
              </div>
              {m?.link && <div>Link: <a href={m.link} target="_blank" rel="noreferrer" className="underline">{m.link}</a></div>}
              {m?.filename && <div>Arquivo: <code>{m.filename}</code>{m?.mime ? ` · ${m.mime}` : ""}{typeof m?.size_bytes === "number" ? ` · ${Math.round(m.size_bytes/1024)} KB` : ""}</div>}
              {m?.asset_id && <div><code>asset_id:</code> {m.asset_id}</div>}
              {m?.storage_path && <div><code>storage_path:</code> {m.storage_path}</div>}
              {m?.upload_status && <div>Status: {m.upload_status}</div>}
              {m?.obs && <div className="text-muted-foreground">Obs: {m.obs}</div>}
              {m?.storage_path && <AssetPreview storagePath={m.storage_path} mime={m.mime} filename={m.filename} />}
            </li>
          ))}
        </ul>
      );
    }

    return <pre className="text-xs bg-muted/30 rounded p-2 overflow-x-auto">{JSON.stringify(value, null, 2)}</pre>;
  }
  if (typeof value === "object") {
    return <pre className="text-xs bg-muted/30 rounded p-2 overflow-x-auto">{JSON.stringify(value, null, 2)}</pre>;
  }
  return <>{String(value)}</>;
}
}

/**
 * Preview + download admin via signed URL do bucket privado orbit-media.
 * Regenera a signed URL sob demanda a partir do storage_path (nunca persiste).
 */
function AssetPreview({ storagePath, mime, filename }: { storagePath: string; mime?: string; filename?: string }) {
  const { url, refresh } = useSignedOrbitMedia(storagePath, 60 * 60);
  const [showPreview, setShowPreview] = useState(false);
  const isImage = (mime || "").startsWith("image/");
  const isAudio = (mime || "").startsWith("audio/");
  const isVideo = (mime || "").startsWith("video/");
  const canPreview = isImage || isAudio || isVideo;

  return (
    <div className="pt-1 space-y-1">
      <div className="flex flex-wrap gap-2">
        {url ? (
          <a
            href={url}
            download={filename || undefined}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-primary underline"
          >
            <Download className="w-3 h-3" /> Baixar
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Gerando link…
          </span>
        )}
        {canPreview && url && (
          <button
            type="button"
            onClick={() => setShowPreview((s) => !s)}
            className="inline-flex items-center gap-1 text-[11px] text-primary underline"
          >
            <Eye className="w-3 h-3" /> {showPreview ? "Ocultar" : "Pré-visualizar"}
          </button>
        )}
      </div>
      {showPreview && url && (
        <div className="pt-1">
          {isImage && (
            <img
              src={url}
              alt={filename || "preview"}
              onError={refresh}
              className="max-h-56 rounded-md border border-border object-contain bg-background"
            />
          )}
          {isAudio && <audio src={url} controls className="w-full" preload="metadata" onError={refresh} />}
          {isVideo && (
            <video
              src={url}
              controls
              className="w-full max-h-72 rounded-md border border-border bg-black"
              preload="metadata"
              onError={refresh}
            />
          )}
        </div>
      )}
    </div>
  );
}


