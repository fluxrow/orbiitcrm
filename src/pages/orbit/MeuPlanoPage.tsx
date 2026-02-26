import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { useTenant } from "@/contexts/TenantContext";
import { useSaasEmpresa, useSaasUsage } from "@/hooks/useSaasPlans";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard, Calendar, Shield, Users, UserSearch, Mail,
  MessageCircle, Instagram, Facebook, Search, Bot,
  CheckCircle2, XCircle, ArrowUpRight, Headphones,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Ativo", variant: "default" },
  trial: { label: "Trial", variant: "outline" },
  expired: { label: "Expirado", variant: "destructive" },
  suspended: { label: "Suspenso", variant: "destructive" },
  pending: { label: "Pendente", variant: "secondary" },
};

interface UsageCardProps {
  label: string;
  icon: React.ElementType;
  used: number;
  limit: number;
  disabled?: boolean;
}

function UsageCard({ label, icon: Icon, used, limit, disabled }: UsageCardProps) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const barColor = disabled
    ? "bg-muted"
    : pct >= 95
      ? "bg-destructive"
      : pct >= 80
        ? "bg-yellow-500"
        : "bg-primary";

  return (
    <Card className={cn(disabled && "opacity-50")}>
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {disabled ? (
          <p className="text-xs text-muted-foreground">Não incluso</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold">{used}</span>
              <span className="text-xs text-muted-foreground">/ {limit}</span>
            </div>
            <Progress value={pct} className="h-2 [&>div]:transition-all" style={{ "--bar-color": "inherit" } as any}>
              <div className={cn("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
            </Progress>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const FEATURE_LIST = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "email", label: "E-mail", icon: Mail },
  { key: "instagram", label: "Instagram", icon: Instagram },
  { key: "facebook", label: "Facebook", icon: Facebook },
  { key: "lead_finder", label: "Lead Finder", icon: Search },
  { key: "ai_agent", label: "Agente IA", icon: Bot },
];

export default function MeuPlanoPage() {
  const { empresaId, planCode, saasStatus, trialEndsAt, empresaNome, isDemo, basePath } = useTenant();
  const { data: saasEmpresa, isLoading } = useSaasEmpresa(empresaId || undefined);
  const currentPeriod = format(new Date(), "yyyy-MM");
  const { data: usage } = useSaasUsage(empresaId || undefined, currentPeriod);
  const navigate = useNavigate();

  const plan = saasEmpresa?.saas_plans;
  const features = (plan?.features || {}) as Record<string, boolean>;
  const limits = (plan?.limits || {}) as Record<string, number>;

  const statusInfo = STATUS_MAP[saasStatus || ""] || { label: saasStatus || "—", variant: "secondary" as const };
  const planName = plan?.name || planCode || (isDemo ? "Demo" : "—");

  const trialDaysLeft = trialEndsAt ? differenceInDays(parseISO(trialEndsAt), new Date()) : null;

  return (
    <OrbitLayout>
      <PageHeader title="Meu Plano" description="Informações da sua assinatura" />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-8 max-w-4xl">
          {/* ── Cabeçalho do plano ── */}
          <Card>
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-primary" />
                  <h2 className="text-2xl font-bold">{planName}</h2>
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </div>
                {empresaNome && (
                  <p className="text-sm text-muted-foreground">{empresaNome}</p>
                )}
                {trialEndsAt && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Calendar className="w-4 h-4" />
                    <span>
                      Expira em{" "}
                      {format(parseISO(trialEndsAt), "dd/MM/yyyy", { locale: ptBR })}
                      {trialDaysLeft !== null && trialDaysLeft >= 0 && (
                        <span className="font-medium text-foreground ml-1">
                          ({trialDaysLeft} {trialDaysLeft === 1 ? "dia" : "dias"})
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Somente leitura</span>
              </div>
            </CardContent>
          </Card>

          {/* ── Limites e consumo ── */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Limites e Consumo</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <UsageCard label="Usuários" icon={Users} used={0} limit={limits.max_users ?? 0} />
              <UsageCard label="Prospects" icon={UserSearch} used={0} limit={limits.max_prospects ?? 0} />
              <UsageCard
                label="E-mails / mês"
                icon={Mail}
                used={usage?.email_sent ?? 0}
                limit={limits.email_monthly ?? 0}
                disabled={!features.email}
              />
              <UsageCard
                label="WhatsApp / mês"
                icon={MessageCircle}
                used={usage?.whatsapp_sent ?? 0}
                limit={limits.whatsapp_monthly ?? 0}
                disabled={!features.whatsapp}
              />
              {features.instagram && (
                <UsageCard
                  label="Instagram / mês"
                  icon={Instagram}
                  used={usage?.ig_sent ?? 0}
                  limit={limits.ig_monthly ?? 0}
                />
              )}
              {features.facebook && (
                <UsageCard
                  label="Facebook / mês"
                  icon={Facebook}
                  used={usage?.fb_sent ?? 0}
                  limit={limits.fb_monthly ?? 0}
                />
              )}
              {features.lead_finder && (
                <UsageCard
                  label="Lead Finder / mês"
                  icon={Search}
                  used={usage?.lead_search_calls ?? 0}
                  limit={limits.lead_search_monthly ?? 0}
                />
              )}
            </div>
          </div>

          {/* ── Features habilitadas ── */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Funcionalidades</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_LIST.map(({ key, label, icon: FIcon }) => {
                const enabled = !!features[key];
                return (
                  <div
                    key={key}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3",
                      enabled ? "border-primary/20 bg-primary/5" : "opacity-50"
                    )}
                  >
                    <FIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium flex-1">{label}</span>
                    {enabled ? (
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    ) : (
                      <XCircle className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Ação ── */}
          <div className="flex flex-col sm:flex-row gap-3">
            {isDemo ? (
              <Button onClick={() => navigate("/trial")}>
                Solicitar Acesso
                <ArrowUpRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <>
                <Button asChild>
                  <a href="mailto:suporte@orbiit.com.br?subject=Solicitar Upgrade">
                    <ArrowUpRight className="w-4 h-4 mr-1" />
                    Solicitar Upgrade
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a
                    href="https://wa.me/5511999999999?text=Olá, gostaria de falar sobre meu plano"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Headphones className="w-4 h-4 mr-1" />
                    Falar com Suporte
                  </a>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </OrbitLayout>
  );
}
