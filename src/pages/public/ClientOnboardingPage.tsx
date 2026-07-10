import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, ChevronLeft, ChevronRight, Save, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  usePublicOnboarding, useSavePublicOnboarding, useSubmitPublicOnboarding,
} from "@/hooks/useOrbitOnboarding";
import { ONBOARDING_SECTIONS, OnboardingField, calculateProgress } from "@/lib/onboarding-sections";

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
                {ONBOARDING_SECTIONS.map((s, i) => (
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
                    <span className="truncate">{s.title}</span>
                  </button>
                ))}
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

              <div className="space-y-5">
                {section.fields.map((f) => (
                  <FieldInput
                    key={f.key}
                    field={f}
                    value={responses?.[section.key]?.[f.key] ?? ""}
                    onChange={(v) => setField(section.key, f.key, v)}
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
  field, value, onChange,
}: { field: OnboardingField; value: any; onChange: (v: any) => void }) {
  return (
    <div>
      <Label className="mb-1.5 block">
        {field.label} {field.required && <span className="text-destructive">*</span>}
      </Label>
      {field.type === "textarea" ? (
        <Textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
        />
      ) : field.type === "select" ? (
        <Select value={value ?? ""} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione…" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type={field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "number" ? "number" : "text"}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      )}
      {field.helper && <p className="text-xs text-muted-foreground mt-1">{field.helper}</p>}
    </div>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-background p-4">{children}</div>;
}
