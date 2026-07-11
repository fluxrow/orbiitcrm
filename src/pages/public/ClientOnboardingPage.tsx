import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, ChevronLeft, ChevronRight, HelpCircle, Lightbulb, Plus, Save, Send, Sparkles, Target, Trash2, Upload, FileCheck2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  usePublicOnboarding, useSavePublicOnboarding, useSubmitPublicOnboarding,
} from "@/hooks/useOrbitOnboarding";
import { ONBOARDING_SECTIONS, OnboardingField, OnboardingSection, StructuredMaterial, calculateProgress } from "@/lib/onboarding-sections";
import { uploadPublicOnboardingAsset } from "@/lib/orbit-onboarding-upload";


export default function ClientOnboardingPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error, refetch } = usePublicOnboarding(token);
  const save = useSavePublicOnboarding();
  const submit = useSubmitPublicOnboarding();

  const [responses, setResponses] = useState<Record<string, Record<string, any>>>({});
  const [stepIdx, setStepIdx] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  // Chaves "sectionKey.fieldKey" marcadas como faltantes na última tentativa de envio.
  const [missingKeys, setMissingKeys] = useState<Set<string>>(new Set());

  const missingBySection = useMemo(() => {
    const map: Record<string, number> = {};
    missingKeys.forEach((k) => {
      const [sec] = k.split(".");
      map[sec] = (map[sec] ?? 0) + 1;
    });
    return map;
  }, [missingKeys]);

  useEffect(() => {
    if (data?.responses) setResponses(data.responses as any);
  }, [data?.id]);

  const section = ONBOARDING_SECTIONS[stepIdx];
  const total = ONBOARDING_SECTIONS.length;
  const progress = useMemo(() => calculateProgress(responses), [responses]);

  if (isLoading) {
    return <FullScreen><p className="text-muted-foreground">Carregando…</p></FullScreen>;
  }
  if (error || !data) {
    return (
      <FullScreen>
        <Card className="p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Link inválido ou expirado</h1>
          <p className="text-muted-foreground">
            Verifique o link enviado por email ou peça um novo para o time da Orbit.
          </p>
        </Card>
      </FullScreen>
    );
  }

  if (submitted || data.status === "concluido" || data.status === "revisado") {
    return (
      <FullScreen>
        <Card className="p-10 max-w-lg text-center">
          <CheckCircle2 className="w-14 h-14 mx-auto mb-4 text-primary" />
          <h1 className="text-2xl font-semibold mb-2">Recebido, obrigado!</h1>
          <p className="text-muted-foreground">
            Suas respostas chegaram. Vamos revisar e marcar a call de kick-off para iniciar a implantação.
          </p>
        </Card>
      </FullScreen>
    );
  }

  const setField = (sectionKey: string, fieldKey: string, value: any) => {
    setResponses((prev) => ({
      ...prev,
      [sectionKey]: { ...(prev[sectionKey] ?? {}), [fieldKey]: value },
    }));
    // Limpa highlight assim que o usuário começa a preencher.
    const composite = `${sectionKey}.${fieldKey}`;
    if (missingKeys.has(composite)) {
      setMissingKeys((prev) => {
        const next = new Set(prev);
        next.delete(composite);
        return next;
      });
    }
  };

  const persist = async () => {
    if (!token) return;
    try {
      await save.mutateAsync({ token, responses });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar");
    }
  };

  const next = async () => {
    await persist();
    if (stepIdx < total - 1) setStepIdx(stepIdx + 1);
  };

  const finish = async () => {
    if (!token) return;
    // Sempre persistir as respostas antes do submit para garantir que
    // nada preenchido seja perdido, mesmo se algo abaixo falhar.
    try {
      await save.mutateAsync({ token, responses });
    } catch (e: any) {
      // Persistência é best-effort — não bloqueia o submit final.
      console.warn("[onboarding] save antes do submit falhou:", e?.message);
    }

    // Validação soft: destaca campos faltantes mas não bloqueia o envio.
    const missing: { sectionIdx: number; label: string; sectionTitle: string; sectionKey: string; fieldKey: string }[] = [];
    ONBOARDING_SECTIONS.forEach((sec, idx) => {
      for (const f of sec.fields) {
        if (!f.required) continue;
        const v = responses?.[sec.key]?.[f.key];
        if (v === undefined || v === null || String(v).trim() === "") {
          missing.push({ sectionIdx: idx, label: f.label, sectionTitle: sec.title, sectionKey: sec.key, fieldKey: f.key });
        }
      }
    });

    setMissingKeys(new Set(missing.map((m) => `${m.sectionKey}.${m.fieldKey}`)));

    if (missing.length > 0) {
      const first = missing[0];
      const preview = missing.slice(0, 3).map((m) => `"${m.label}"`).join(", ");
      const extra = missing.length > 3 ? ` e +${missing.length - 3}` : "";
      toast.warning(
        `${missing.length} campo(s) recomendado(s) em branco: ${preview}${extra}. Enviando mesmo assim — você pode complementar depois.`,
        {
          duration: 8000,
          action: {
            label: `Ir para "${first.sectionTitle}"`,
            onClick: () => setStepIdx(first.sectionIdx),
          },
        },
      );
    }

    try {
      await submit.mutateAsync({ token, responses });
      setSubmitted(true);
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-8 lg:py-12">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-2 text-sm text-primary font-medium mb-2">
            <Sparkles className="w-4 h-4" /> Onboarding · Orbit CRM
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">
            Olá, {data.cliente_nome || "tudo bem"}!
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Vamos implantar o Orbit para <strong>{data.cliente_empresa || data.empresa_nome || "sua empresa"}</strong>.
            Preencha as seções abaixo — suas respostas são salvas automaticamente e você pode pausar quando quiser.
          </p>
        </header>

        <div className="grid lg:grid-cols-[260px_1fr] gap-6">
          {/* Steps sidebar */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <Card className="glass-card p-4">
              <div className="mb-4">
                <Progress value={progress} className="h-2 mb-2" />
                <p className="text-xs text-muted-foreground">{progress}% preenchido</p>
              </div>
              <nav className="space-y-1">
                {ONBOARDING_SECTIONS.map((s, i) => {
                  const missCount = missingBySection[s.key] ?? 0;
                  return (
                    <button
                      key={s.key}
                      onClick={() => setStepIdx(i)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition ${
                        i === stepIdx
                          ? "bg-primary/15 text-primary font-medium"
                          : "hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-semibold shrink-0 ${
                        i === stepIdx ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>{i + 1}</span>
                      <span className="truncate flex-1">{s.title}</span>
                      {missCount > 0 && (
                        <span
                          className="ml-auto shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold grid place-items-center"
                          title={`${missCount} campo(s) obrigatório(s) em branco`}
                        >
                          {missCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </Card>
          </aside>

          {/* Form */}
          <main>
            <Card className="glass-card p-6 lg:p-8">
              <div className="mb-6">
                <p className="text-xs uppercase tracking-wider text-primary font-semibold mb-1">
                  Seção {stepIdx + 1} de {total}
                </p>
                <h2 className="text-2xl font-bold mb-1">{section.title}</h2>
                <p className="text-muted-foreground">{section.description}</p>
              </div>

              <SectionExplainer section={section} />

              <div className="space-y-5">
                {section.fields.map((f) => (
                  <FieldInput
                    key={f.key}
                    field={f}
                    value={responses?.[section.key]?.[f.key] ?? ""}
                    onChange={(v) => setField(section.key, f.key, v)}
                    missing={missingKeys.has(`${section.key}.${f.key}`)}
                    token={token}
                    sectionKey={section.key}
                  />
                ))}

              </div>

              <div className="flex items-center justify-between mt-8 pt-6 border-t">
                <Button
                  variant="ghost"
                  disabled={stepIdx === 0}
                  onClick={() => setStepIdx(stepIdx - 1)}
                  className="gap-1.5"
                >
                  <ChevronLeft className="w-4 h-4" /> Voltar
                </Button>

                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={persist} disabled={save.isPending} className="gap-1.5">
                    <Save className="w-4 h-4" />
                    {save.isPending ? "Salvando…" : "Salvar"}
                  </Button>
                  {stepIdx < total - 1 ? (
                    <Button onClick={next} className="gap-1.5">
                      Avançar <ChevronRight className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button onClick={finish} disabled={submit.isPending} className="gap-1.5">
                      <Send className="w-4 h-4" />
                      {submit.isPending ? "Enviando…" : "Enviar respostas"}
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            <p className="text-xs text-muted-foreground text-center mt-4">
              🔒 Suas respostas são privadas e usadas só para a implantação do Orbit CRM.
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  field, value, onChange, missing, token, sectionKey,
}: {
  field: OnboardingField;
  value: any;
  onChange: (v: any) => void;
  missing?: boolean;
  token?: string;
  sectionKey?: string;
}) {
  const invalidCls = missing
    ? "border-destructive ring-2 ring-destructive/40 focus-visible:ring-destructive/60"
    : "";
  return (
    <div className={missing ? "rounded-md" : ""}>
      <Label className="mb-1.5 block">
        {field.label} {field.required && <span className="text-destructive">*</span>}
      </Label>
      {field.type === "textarea" ? (
        <Textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className={invalidCls}
        />
      ) : field.type === "select" ? (
        <Select value={value ?? ""} onValueChange={onChange}>
          <SelectTrigger className={invalidCls}>
            <SelectValue placeholder="Selecione…" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "asset_list" ? (
        <AssetListInput
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          token={token}
          sectionKey={sectionKey ?? ""}
          fieldKey={field.key}
        />


      ) : (
        <Input
          type={field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "number" ? "number" : "text"}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={invalidCls}
        />
      )}
      {missing && (
        <p className="text-xs text-destructive mt-1">Campo recomendado — em branco no envio.</p>
      )}
      {field.helper && <p className="text-xs text-muted-foreground mt-1">{field.helper}</p>}
    </div>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-background p-4">{children}</div>;
}

function SectionExplainer({ section }: { section: OnboardingSection }) {
  if (!section.clientPurpose && !section.examples?.length && !section.ifUnsure) return null;
  return (
    <Card className="mb-6 border-primary/20 bg-primary/5 p-4">
      {section.clientPurpose && (
        <div className="flex gap-2.5 mb-3">
          <Target className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-foreground/90 leading-relaxed">
            <span className="font-semibold">Por que perguntamos: </span>
            {section.clientPurpose}
          </p>
        </div>
      )}
      {section.examples && section.examples.length > 0 && (
        <div className="flex gap-2.5 mb-3">
          <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-foreground/85">
            <span className="font-semibold">Exemplos:</span>
            <ul className="mt-1 space-y-0.5 list-disc list-inside marker:text-muted-foreground">
              {section.examples.map((ex, i) => (
                <li key={i}>{ex}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {section.ifUnsure && (
        <div className="flex gap-2.5">
          <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground/80">Se não souber: </span>
            {section.ifUnsure}
          </p>
        </div>
      )}
    </Card>
  );
}

function AssetListInput({
  value, onChange, token, sectionKey, fieldKey,
}: {
  value: StructuredMaterial[];
  onChange: (v: StructuredMaterial[]) => void;
  token?: string;
  sectionKey: string;
  fieldKey: string;
}) {
  const items = Array.isArray(value) ? value : [];
  // Signed URLs em memória (não persistidas). Chave = item.id.
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const update = (idx: number, patch: Partial<StructuredMaterial>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };
  const genId = () =>
    (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  const add = () =>
    onChange([...items, { id: genId(), tipo: "PDF", titulo: "", link: "", obs: "" }]);
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  const handleUpload = async (idx: number, file: File) => {
    if (!token) {
      toast.error("Token de onboarding ausente — recarregue a página.");
      return;
    }
    const item = items[idx];
    const itemId = item?.id ?? genId();
    // Preview otimista via ObjectURL enquanto o upload roda.
    const localUrl = URL.createObjectURL(file);
    setPreviews((p) => ({ ...p, [itemId]: localUrl }));
    update(idx, { id: itemId, upload_status: "uploading", upload_error: undefined, filename: file.name, mime: file.type });
    try {
      const res = await uploadPublicOnboardingAsset({
        token,
        section_key: sectionKey,
        field_key: fieldKey,
        item_id: itemId,
        file,
      });
      update(idx, {
        id: itemId,
        asset_id: res.asset_id,
        storage_path: res.storage_path,
        filename: res.filename,
        mime: res.mime,
        size_bytes: res.size_bytes,
        upload_status: "uploaded",
        titulo: item?.titulo || res.filename,
      });
      // Substitui preview local pela signed URL persistente.
      if (res.signed_url) {
        setPreviews((p) => ({ ...p, [itemId]: res.signed_url! }));
        URL.revokeObjectURL(localUrl);
      }
      toast.success(`Arquivo enviado: ${res.filename}`);
    } catch (e: any) {
      update(idx, { upload_status: "error", upload_error: e?.message || String(e) });
      toast.error(`Falha no upload: ${e?.message || e}`);
    }
  };


  const TIPO_OPTS = ["PDF", "Vídeo", "Áudio", "Link", "Imagem", "Apresentação", "Planilha", "Outro"];

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Nenhum material adicionado. Clique em "Adicionar material" pra listar apresentações, cases, vídeos etc.
        </p>
      )}
      {items.map((it, idx) => (
        <div key={it.id ?? idx} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <div className="grid gap-2 md:grid-cols-[140px_1fr_auto]">
            <Select value={it.tipo || "PDF"} onValueChange={(v) => update(idx, { tipo: v })}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                {TIPO_OPTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={it.titulo ?? ""}
              onChange={(e) => update(idx, { titulo: e.target.value })}
              placeholder="Título do material (ex: Apresentação comercial 2026)"
            />
            <Button
              type="button" variant="ghost" size="icon"
              onClick={() => remove(idx)}
              disabled={it.upload_status === "uploading"}
              className="text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={it.upload_status === "uploading" ? "Aguarde: upload em andamento" : "Remover material"}
              title={it.upload_status === "uploading" ? "Aguarde o upload terminar para remover" : "Remover material"}
            >
              {it.upload_status === "uploading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          </div>
          <Input
            value={it.link ?? ""}
            onChange={(e) => update(idx, { link: e.target.value })}
            placeholder="Link (Drive, YouTube, site…) — opcional"
          />
          <Textarea
            value={it.obs ?? ""}
            onChange={(e) => update(idx, { obs: e.target.value })}
            placeholder="Observações — quando/como esse material é usado (opcional)"
            rows={2}
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer rounded-md border border-input px-2.5 py-1.5 hover:bg-muted/60">
              {it.upload_status === "uploading" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : it.upload_status === "uploaded" ? (
                <FileCheck2 className="w-3.5 h-3.5 text-primary" />
              ) : it.upload_status === "error" ? (
                <AlertCircle className="w-3.5 h-3.5 text-destructive" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>
                {it.upload_status === "uploading"
                  ? "Enviando…"
                  : it.upload_status === "uploaded"
                    ? "Trocar arquivo"
                    : "Anexar arquivo"}
              </span>
              <input
                type="file"
                className="hidden"
                disabled={it.upload_status === "uploading"}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(idx, f);
                  e.target.value = "";
                }}
              />
            </label>
            {it.filename && (
              <span className="text-[11px] text-muted-foreground truncate max-w-[280px]" title={it.storage_path || it.filename}>
                📎 {it.filename}
                {typeof it.size_bytes === "number" && ` · ${Math.round(it.size_bytes / 1024)} KB`}
              </span>
            )}
            {(it.upload_status === "uploaded" || it.upload_status === "error" || it.filename || it.asset_id) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground"
                disabled={it.upload_status === "uploading"}
                title={it.upload_status === "uploading" ? "Aguarde o upload terminar para remover" : "Remover apenas o arquivo (mantém título e observações)"}
                onClick={() => {
                  if (it.upload_status === "uploading") return;
                  if (!window.confirm("Remover o arquivo enviado? O material continua na lista, mas sem anexo.")) return;
                  const itemId = it.id;
                  if (itemId) {
                    setPreviews((p) => {
                      const next = { ...p };
                      const url = next[itemId];
                      if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
                      delete next[itemId];
                      return next;
                    });
                  }
                  update(idx, {
                    asset_id: undefined,
                    storage_path: undefined,
                    filename: undefined,
                    mime: undefined,
                    size_bytes: undefined,
                    upload_status: undefined,
                    upload_error: undefined,
                  });
                  toast.success("Arquivo removido");
                }}
                aria-label={it.upload_status === "uploading" ? "Aguarde: upload em andamento" : "Remover arquivo"}
              >
                {it.upload_status === "uploading" ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Enviando…
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3 h-3" /> Remover arquivo
                  </>
                )}
              </Button>
            )}
            {it.upload_status === "error" && it.upload_error && (
              <span className="text-[11px] text-destructive">{it.upload_error}</span>
            )}
          </div>
          {(() => {
            const url = it.id ? previews[it.id] : undefined;
            if (!url) return null;
            const mime = it.mime || "";
            if (mime.startsWith("image/")) {
              return (
                <div className="pt-1">
                  <img src={url} alt={it.filename || "preview"} className="max-h-48 rounded-md border border-border object-contain bg-background" />
                </div>
              );
            }
            if (mime.startsWith("audio/")) {
              return <audio src={url} controls className="w-full pt-1" preload="metadata" />;
            }
            if (mime.startsWith("video/")) {
              return (
                <video src={url} controls className="w-full max-h-64 rounded-md border border-border bg-black" preload="metadata" />
              );
            }
            return (
              <a href={url} target="_blank" rel="noreferrer" className="text-xs underline text-primary pt-1 inline-block">
                Abrir arquivo em nova aba
              </a>
            );
          })()}
        </div>
      ))}
      <Button
        type="button" variant="outline" size="sm" onClick={add}
        className="gap-1.5"
      >
        <Plus className="w-4 h-4" /> Adicionar material
      </Button>
    </div>
  );
}

