import { Navigate, useSearchParams } from "react-router-dom";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { useTenant } from "@/contexts/TenantContext";
import { useIsAdmin } from "@/hooks/useUserRole";
import { useSaasEmpresa, useSaasUsage, useSaasPlans } from "@/hooks/useSaasPlans";
import { useStripeCheckout, useStripePortal, useStripeChangePlan } from "@/hooks/useStripeSubscription";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard, Calendar, Shield, Users, UserSearch, Mail,
  MessageCircle, Instagram, Facebook, Search, Bot,
  CheckCircle2, XCircle, ArrowUpRight, ArrowDownRight, Headphones,
  AlertTriangle, ExternalLink, Loader2,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

/* ── Status maps ── */

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Ativo", variant: "default" },
  trial: { label: "Trial", variant: "outline" },
  expired: { label: "Expirado", variant: "destructive" },
  suspended: { label: "Suspenso", variant: "destructive" },
  canceled: { label: "Cancelado", variant: "destructive" },
  pending: { label: "Pendente", variant: "secondary" },
};

const STRIPE_STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Ativa", variant: "default" },
  trialing: { label: "Trial", variant: "outline" },
  past_due: { label: "Pagamento pendente", variant: "destructive" },
  canceled: { label: "Cancelada", variant: "destructive" },
  unpaid: { label: "Não paga", variant: "destructive" },
  incomplete: { label: "Incompleta", variant: "secondary" },
  incomplete_expired: { label: "Expirada", variant: "destructive" },
  paused: { label: "Pausada", variant: "secondary" },
};

/* ── UsageCard ── */

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
              <span className="text-xs text-muted-foreground">/ {limit === -1 ? "∞" : limit}</span>
            </div>
            {limit !== -1 && (
              <Progress value={pct} className="h-2 [&>div]:transition-all">
                <div className={cn("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
              </Progress>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Feature list ── */

const FEATURE_LIST = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "email", label: "E-mail", icon: Mail },
  { key: "instagram", label: "Instagram", icon: Instagram },
  { key: "facebook", label: "Facebook", icon: Facebook },
  { key: "lead_finder", label: "Lead Finder", icon: Search },
  { key: "ai_agent", label: "Agente IA", icon: Bot },
];

/* ── Hooks for real counts ── */

function useRealCounts(empresaId: string | null) {
  const usersQuery = useQuery({
    queryKey: ["real-count-users", empresaId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresaId!)
        .eq("ativo", true);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!empresaId,
  });

  const prospectsQuery = useQuery({
    queryKey: ["real-count-prospects", empresaId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orbit_prospects")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresaId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!empresaId,
  });

  return {
    usersCount: usersQuery.data ?? 0,
    prospectsCount: prospectsQuery.data ?? 0,
  };
}

/* ── Page ── */

export default function MeuPlanoPage() {
  const { empresaId, planCode, saasStatus, trialEndsAt, empresaNome, isDemo, basePath } = useTenant();
  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const { data: saasEmpresa, isLoading } = useSaasEmpresa(empresaId || undefined);
  const { data: allPlans } = useSaasPlans();
  const currentPeriod = format(new Date(), "yyyy-MM");
  const { data: usage } = useSaasUsage(empresaId || undefined, currentPeriod);
  const { usersCount, prospectsCount } = useRealCounts(empresaId);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const checkout = useStripeCheckout();
  const portal = useStripePortal();
  const changePlan = useStripeChangePlan();

  // Show success/cancel toasts from Stripe redirect
  useEffect(() => {
    if (searchParams.get("success") === "1") {
      toast.success("Assinatura realizada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["saas-empresa"] });
    } else if (searchParams.get("canceled") === "1") {
      toast.info("Checkout cancelado.");
    }
  }, [searchParams, queryClient]);

  if (!isAdminLoading && !isAdmin) {
    return <Navigate to={`${basePath}/dashboard`} replace />;
  }

  const plan = saasEmpresa?.saas_plans;
  const features = (plan?.features || {}) as Record<string, boolean>;
  const limits = (plan?.limits || {}) as Record<string, number>;

  const statusInfo = STATUS_MAP[saasStatus || ""] || { label: saasStatus || "—", variant: "secondary" as const };
  const planName = plan?.name || planCode || (isDemo ? "Demo" : "—");

  const trialDaysLeft = trialEndsAt ? differenceInDays(parseISO(trialEndsAt), new Date()) : null;

  // Stripe state
  const hasSubscription = !!saasEmpresa?.stripe_subscription_id;
  const stripeStatus = saasEmpresa?.stripe_status;
  const stripeInfo = stripeStatus ? STRIPE_STATUS_MAP[stripeStatus] : null;
  const nextBilling = saasEmpresa?.current_period_end;
  const cancelAtEnd = saasEmpresa?.cancel_at_period_end;
  const paymentError = saasEmpresa?.last_payment_error;

  // All plans available for switching (exclude demo, must have stripe prices, must be active)
  const switchablePlans = (allPlans || []).filter(
    (p) => p.code !== "demo" && p.stripe_price_id_monthly && p.stripe_active
  );

  // Sort plans by order of limits (max_users as proxy for tier level)
  const sortedPlans = [...switchablePlans].sort(
    (a, b) => ((a.limits as any)?.max_users ?? 0) - ((b.limits as any)?.max_users ?? 0)
  );

  const currentPlanIndex = sortedPlans.findIndex((p) => p.id === plan?.id);

  const returnPath = isDemo ? "/demo/meu-plano" : `${basePath}/meu-plano`;

  const handleCheckout = (priceId: string) => {
    if (!empresaId) return;
    checkout.mutate({
      empresaId,
      priceId,
      successUrl: `${window.location.origin}${returnPath}?success=1`,
      cancelUrl: `${window.location.origin}${returnPath}?canceled=1`,
    });
  };

  const handlePortal = () => {
    if (!empresaId) return;
    portal.mutate({
      empresaId,
      returnUrl: `${window.location.origin}${returnPath}`,
    });
  };

  const handleChangePlan = (newPriceId: string) => {
    if (!empresaId) return;
    changePlan.mutate(
      { empresaId, newPriceId },
      {
        onSuccess: () => {
          toast.success("Plano alterado com sucesso!");
          queryClient.invalidateQueries({ queryKey: ["saas-empresa"] });
          queryClient.invalidateQueries({ queryKey: ["saas-plans"] });
        },
        onError: (err: any) => {
          toast.error(`Erro ao trocar plano: ${err.message}`);
        },
      }
    );
  };

  return (
    <OrbitLayout>
      <PageHeader title="Meu Plano" description="Informações da sua assinatura" />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-8 max-w-4xl">
          {/* ── Payment error alert ── */}
          {paymentError && (
            <Card className="border-destructive bg-destructive/5">
              <CardContent className="flex items-center gap-3 p-4">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">Falha no pagamento</p>
                  <p className="text-xs text-muted-foreground">{paymentError}</p>
                </div>
                <Button size="sm" variant="destructive" onClick={handlePortal} disabled={portal.isPending}>
                  Atualizar pagamento
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ── Plan header ── */}
          <Card>
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-primary" />
                  <h2 className="text-2xl font-bold">{planName}</h2>
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  {stripeInfo && (
                    <Badge variant={stripeInfo.variant}>{stripeInfo.label}</Badge>
                  )}
                </div>
                {empresaNome && (
                  <p className="text-sm text-muted-foreground">{empresaNome}</p>
                )}

                {/* Trial info */}
                {trialEndsAt && !hasSubscription && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Calendar className="w-4 h-4" />
                    <span>
                      Trial expira em{" "}
                      {format(parseISO(trialEndsAt), "dd/MM/yyyy", { locale: ptBR })}
                      {trialDaysLeft !== null && trialDaysLeft >= 0 && (
                        <span className="font-medium text-foreground ml-1">
                          ({trialDaysLeft} {trialDaysLeft === 1 ? "dia" : "dias"})
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* Next billing */}
                {nextBilling && hasSubscription && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {cancelAtEnd ? "Acesso até" : "Próxima cobrança"}:{" "}
                      {format(parseISO(nextBilling), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                    {cancelAtEnd && (
                      <Badge variant="outline" className="text-xs">Cancelamento agendado</Badge>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasSubscription && (
                  <Button variant="outline" size="sm" onClick={handlePortal} disabled={portal.isPending}>
                    {portal.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <ExternalLink className="w-4 h-4 mr-1" />
                    )}
                    Portal de Cobrança
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Usage & Limits ── */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Limites e Consumo</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <UsageCard label="Usuários" icon={Users} used={usersCount} limit={limits.max_users ?? 0} />
              <UsageCard label="Prospects" icon={UserSearch} used={prospectsCount} limit={limits.max_prospects ?? 0} />
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
                <UsageCard label="Instagram / mês" icon={Instagram} used={usage?.ig_sent ?? 0} limit={limits.ig_monthly ?? 0} />
              )}
              {features.facebook && (
                <UsageCard label="Facebook / mês" icon={Facebook} used={usage?.fb_sent ?? 0} limit={limits.fb_monthly ?? 0} />
              )}
              {features.lead_finder && (
                <UsageCard label="Lead Finder / mês" icon={Search} used={usage?.lead_search_calls ?? 0} limit={limits.lead_search_monthly ?? 0} />
              )}
            </div>
          </div>

          {/* ── Features ── */}
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

          {/* ── Plans / Upgrade / Downgrade ── */}
          {!isDemo && sortedPlans.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">
                {hasSubscription ? "Trocar de Plano" : "Assinar um Plano"}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sortedPlans.map((p, idx) => {
                  const isCurrent = p.id === plan?.id;
                  const isUpgrade = currentPlanIndex >= 0 && idx > currentPlanIndex;
                  const isDowngrade = currentPlanIndex >= 0 && idx < currentPlanIndex;
                  const pLimits = (p.limits || {}) as Record<string, number>;
                  const pFeatures = (p.features || {}) as Record<string, boolean>;

                  return (
                    <Card
                      key={p.id}
                      className={cn(
                        "flex flex-col justify-between",
                        isCurrent && "border-primary ring-2 ring-primary/20"
                      )}
                    >
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{p.name}</CardTitle>
                          {isCurrent && (
                            <Badge variant="default" className="text-xs">Plano Atual</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1 mt-2">
                          <p>{pLimits.max_users ?? "—"} usuários · {pLimits.max_prospects ?? "—"} prospects</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {FEATURE_LIST.filter(f => pFeatures[f.key]).map(f => (
                              <Badge key={f.key} variant="outline" className="text-[10px] px-1.5 py-0">
                                {f.label}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {isCurrent ? (
                          <Button className="w-full" variant="outline" disabled>
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Plano Atual
                          </Button>
                        ) : hasSubscription ? (
                          <>
                            <Button
                              className="w-full"
                              variant={isUpgrade ? "default" : "outline"}
                              onClick={() => handleChangePlan(p.stripe_price_id_monthly!)}
                              disabled={changePlan.isPending}
                            >
                              {changePlan.isPending ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : isUpgrade ? (
                                <ArrowUpRight className="w-4 h-4 mr-1" />
                              ) : (
                                <ArrowDownRight className="w-4 h-4 mr-1" />
                              )}
                              {isUpgrade ? "Fazer Upgrade" : isDowngrade ? "Fazer Downgrade" : "Trocar Plano"}
                            </Button>
                            {p.stripe_price_id_yearly && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-xs"
                                onClick={() => handleChangePlan(p.stripe_price_id_yearly!)}
                                disabled={changePlan.isPending}
                              >
                                Trocar para Anual
                              </Button>
                            )}
                          </>
                        ) : (
                          <>
                            <Button
                              className="w-full"
                              onClick={() => handleCheckout(p.stripe_price_id_monthly!)}
                              disabled={checkout.isPending}
                            >
                              {checkout.isPending ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <ArrowUpRight className="w-4 h-4 mr-1" />
                              )}
                              Assinar Mensal
                            </Button>
                            {p.stripe_price_id_yearly && (
                              <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => handleCheckout(p.stripe_price_id_yearly!)}
                                disabled={checkout.isPending}
                              >
                                Assinar Anual
                              </Button>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex flex-col sm:flex-row gap-3">
            {hasSubscription && (
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
            )}

            {/* Demo user: request access */}
            {isDemo && (
              <Button onClick={() => navigate("/trial")}>
                Solicitar Acesso
                <ArrowUpRight className="w-4 h-4 ml-1" />
              </Button>
            )}

            {/* No subscription and no plans available */}
            {!hasSubscription && !isDemo && sortedPlans.length === 0 && (
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
