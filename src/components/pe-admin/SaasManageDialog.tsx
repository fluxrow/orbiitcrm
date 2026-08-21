import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Copy, Mail, MessageCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateSaasEmpresa, useSaasPlans, type SaasEmpresa } from "@/hooks/useSaasPlans";
import { campaignPermissionKeys, type CampaignPermissionKey } from "@/hooks/useTenantCampaignPermissions";

interface SaasManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresa: SaasEmpresa | null;
}

const STATUS_OPTIONS = [
  { value: "invited", label: "Convidado" },
  { value: "onboarding", label: "Onboarding" },
  { value: "active", label: "Ativo" },
  { value: "suspended", label: "Suspenso" },
  { value: "canceled", label: "Cancelado" },
];

const CAMPAIGN_PERMISSION_LABELS: Record<CampaignPermissionKey, string> = {
  campaign_create: "Criar campanhas",
  campaign_edit: "Editar campanhas",
  campaign_submit_review: "Enviar para revisão",
  campaign_approve: "Aprovar campanhas",
  campaign_dispatch: "Executar disparo",
};

export default function SaasManageDialog({ open, onOpenChange, empresa }: SaasManageDialogProps) {
  const updateSaas = useUpdateSaasEmpresa();
  const { data: plans } = useSaasPlans();

  const [status, setStatus] = useState(empresa?.status || "invited");
  const [planId, setPlanId] = useState(empresa?.plan_id || "");
  const [trialEndsAt, setTrialEndsAt] = useState(empresa?.trial_ends_at?.slice(0, 10) || "");

  // Cadastro fields
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [emailContato, setEmailContato] = useState("");
  const [telefone, setTelefone] = useState("");
  const [maxUsuarios, setMaxUsuarios] = useState<string>("");
  const [savingCadastro, setSavingCadastro] = useState(false);
  const [loadingCadastro, setLoadingCadastro] = useState(false);

  // Invite form
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteKind, setInviteKind] = useState<"tenant_admin" | "tenant_operator">("tenant_admin");
  const [invitePermissions, setInvitePermissions] = useState<CampaignPermissionKey[]>([]);
  const [inviting, setInviting] = useState(false);
  const [generatedInvite, setGeneratedInvite] = useState<{ email: string; url: string } | null>(null);

  // Users list
  const [users, setUsers] = useState<any[]>([]);

  // Pending invites
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [rotatingId, setRotatingId] = useState<string | null>(null);


  const currentEmpresaId = empresa?.empresa_id;

  useEffect(() => {
    if (!currentEmpresaId || !open) return;
    setStatus(empresa?.status || "invited");
    setPlanId(empresa?.plan_id || "");
    setTrialEndsAt(empresa?.trial_ends_at?.slice(0, 10) || "");
    setInviteName(empresa?.responsible_name || "");
    setInviteEmail(empresa?.responsible_email || "");
    setGeneratedInvite(null);
    setInviteKind("tenant_admin");
    setInvitePermissions([]);

    (async () => {
      setLoadingCadastro(true);
      const { data: emp } = await supabase
        .from("orbit_empresas")
        .select("nome, slug, cnpj, email_contato, telefone, max_usuarios")
        .eq("id", currentEmpresaId)
        .maybeSingle();
      if (emp) {
        setNome(emp.nome || "");
        setSlug(emp.slug || "");
        setCnpj(emp.cnpj || "");
        setEmailContato(emp.email_contato || "");
        setTelefone(emp.telefone || "");
        setMaxUsuarios(emp.max_usuarios ? String(emp.max_usuarios) : "");
      }
      setLoadingCadastro(false);

      // Users
      const { data: membs } = await supabase
        .from("user_empresa_memberships")
        .select("user_id, role")
        .eq("empresa_id", currentEmpresaId);
      const ids = (membs || []).map((m: any) => m.user_id);
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, nome, email")
          .in("id", ids);
        const profMap = new Map((profs || []).map((p: any) => [p.id, p]));
        setUsers((membs || []).map((m: any) => ({ ...m, profile: profMap.get(m.user_id) })));
      } else {
        setUsers([]);
      }

      await loadInvites(currentEmpresaId);
    })();
  }, [currentEmpresaId, open]);

  const loadInvites = async (empresaId: string) => {
    const { data } = await supabase
      .from("saas_invites")
      .select("id, email, responsible_name, expires_at, used_at, created_at")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false });
    setPendingInvites(data || []);
  };


  if (!empresa) return null;

  const handleSavePlan = async () => {
    try {
      await updateSaas.mutateAsync({
        empresaId: empresa.empresa_id,
        status,
        plan_id: planId,
        trial_ends_at: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
        activated_at: status === "active" && !empresa.activated_at ? new Date().toISOString() : empresa.activated_at,
      });
      toast.success("Assinatura atualizada");
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar");
    }
  };

  const handleSaveCadastro = async () => {
    if (!nome.trim()) { toast.error("Nome é obrigatório"); return; }
    setSavingCadastro(true);
    try {
      const slugNormalized = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      const { error } = await supabase
        .from("orbit_empresas")
        .update({
          nome: nome.trim(),
          slug: slugNormalized || null,
          cnpj: cnpj.trim() || null,
          email_contato: emailContato.trim() || null,
          telefone: telefone.trim() || null,
          max_usuarios: maxUsuarios ? parseInt(maxUsuarios) : null,
        })
        .eq("id", empresa.empresa_id);
      if (error) throw error;
      toast.success("Cadastro atualizado");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar cadastro");
    } finally {
      setSavingCadastro(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      toast.error("Preencha nome e email");
      return;
    }
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-empresa-invite", {
        body: {
          empresa_id: empresa.empresa_id,
          responsible_name: inviteName.trim(),
          responsible_email: inviteEmail.trim().toLowerCase(),
          invite_kind: inviteKind,
          membership_role: inviteKind === "tenant_operator" ? "member" : "admin",
          campaign_permissions: inviteKind === "tenant_operator" ? invitePermissions : [],
        },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error?.message || "Falha ao convidar");
      const activationUrl = data?.data?.activation_url;
      if (typeof activationUrl === "string" && activationUrl) {
        setGeneratedInvite({ email: inviteEmail.trim().toLowerCase(), url: activationUrl });
      }
      const delivery = data?.data?.email_delivery;
      if (delivery?.status === "sent") {
        toast.success(`Convite enviado para ${inviteEmail.trim()}`);
      } else if (delivery?.status === "failed") {
        toast.warning("Convite criado, mas o e-mail não foi enviado", {
          description: delivery.error || "O provedor de e-mail recusou o envio.",
        });
      } else if (delivery?.status === "not_configured") {
        toast.warning("Convite criado sem envio de e-mail", {
          description: "O provedor de e-mail não está configurado.",
        });
      } else {
        toast.warning("Convite criado; entrega do e-mail não confirmada");
      }
      setInviteName("");
      setInviteEmail("");
      setInvitePermissions([]);
      if (currentEmpresaId) await loadInvites(currentEmpresaId);
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar convite");
    } finally {
      setInviting(false);
    }
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
      return true;
    } catch {
      toast.error("Não foi possível copiar o link");
      return false;
    }
  };

  const handleCopyInviteLink = async () => {
    if (!generatedInvite) return;
    await copyToClipboard(generatedInvite.url);
  };

  const buildWhatsAppHref = (url: string) => {
    const msg = `Olá! Seu acesso ao Orbit (${empresa?.empresa_nome || "sua empresa"}) está pronto. Use este link para ativar sua conta (válido por 48h): ${url}`;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  };

  const rotateInviteLink = async (inviteId: string): Promise<string | null> => {
    setRotatingId(inviteId);
    try {
      const { data, error } = await supabase.functions.invoke("rotate-empresa-invite", {
        body: { invite_id: inviteId },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error?.message || "Falha ao gerar link");
      const url = data?.data?.activation_url;
      if (typeof url !== "string" || !url) throw new Error("Link não retornado");
      if (currentEmpresaId) await loadInvites(currentEmpresaId);
      return url;
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar novo link");
      return null;
    } finally {
      setRotatingId(null);
    }
  };

  const handleRotateAndCopy = async (inviteId: string) => {
    const url = await rotateInviteLink(inviteId);
    if (url) await copyToClipboard(url);
  };

  const handleRotateAndWhatsApp = async (inviteId: string) => {
    const url = await rotateInviteLink(inviteId);
    if (!url) return;
    window.open(buildWhatsAppHref(url), "_blank", "noopener,noreferrer");
  };

  const inviteState = (inv: any): "used" | "expired" | "pending" => {
    if (inv.used_at) return "used";
    if (new Date(inv.expires_at) < new Date()) return "expired";
    return "pending";
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {empresa.empresa_nome || "Empresa"}
            <Badge variant="outline">/{empresa.empresa_slug || "—"}</Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="cadastro" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
            <TabsTrigger value="plano">Plano</TabsTrigger>
            <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          </TabsList>

          <TabsContent value="cadastro" className="space-y-3 pt-4">
            {loadingCadastro ? (
              <div className="text-sm text-muted-foreground">Carregando...</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label>Razão social / Nome</Label>
                    <Input value={nome} onChange={(e) => setNome(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Slug (URL)</Label>
                    <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="minha-empresa" />
                  </div>
                  <div className="space-y-1">
                    <Label>CNPJ</Label>
                    <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
                  </div>
                  <div className="space-y-1">
                    <Label>Email de contato</Label>
                    <Input type="email" value={emailContato} onChange={(e) => setEmailContato(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Telefone</Label>
                    <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Máx. usuários</Label>
                    <Input type="number" value={maxUsuarios} onChange={(e) => setMaxUsuarios(e.target.value)} placeholder="Ilimitado" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSaveCadastro} disabled={savingCadastro}>
                    {savingCadastro ? "Salvando..." : "Salvar cadastro"}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="plano" className="space-y-4 pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{empresa.responsible_name || empresa.responsible_email}</span>
              <Badge variant="outline">{empresa.saas_plans?.name || "—"}</Badge>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plano</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(plans ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSavePlan} disabled={updateSaas.isPending}>
                {updateSaas.isPending ? "Salvando..." : "Salvar plano"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="usuarios" className="space-y-4 pt-4">
            <div className="space-y-2">
              {users.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Nenhum usuário vinculado ainda.
                </div>
              ) : (
                <div className="space-y-1">
                  {users.map((u) => (
                    <div key={u.user_id} className="flex items-center justify-between p-2 rounded border">
                      <div>
                        <div className="text-sm font-medium">{u.profile?.nome || "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.profile?.email || u.user_id}</div>
                      </div>
                      <Badge variant="secondary">{u.role}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium">Convidar novo usuário</div>
                <div className="text-xs text-muted-foreground">Envia email com link para criar conta nesta empresa.</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Nome completo" />
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="email@empresa.com" />
              </div>
              {empresa.empresa_slug === "fluxrow" && (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="space-y-1">
                    <Label>Tipo de acesso</Label>
                    <Select value={inviteKind} onValueChange={(value: "tenant_admin" | "tenant_operator") => setInviteKind(value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tenant_admin">Administrador do tenant</SelectItem>
                        <SelectItem value="tenant_operator">Usuário operacional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {inviteKind === "tenant_operator" && (
                    <>
                      <div className="rounded bg-muted p-2 text-xs text-muted-foreground">
                        Papel: membro operacional. Para acesso administrativo completo, use o tipo “Administrador do tenant”.
                      </div>
                      <div className="space-y-2">
                        <Label>Permissões de campanhas</Label>
                        {campaignPermissionKeys.map((permission) => (
                          <div key={permission} className="flex items-center justify-between gap-3 rounded border p-2">
                            <span className="text-sm">{CAMPAIGN_PERMISSION_LABELS[permission]}</span>
                            <Switch
                              checked={invitePermissions.includes(permission)}
                              onCheckedChange={(checked) => setInvitePermissions((current) => checked
                                ? [...current, permission]
                                : current.filter((item) => item !== permission))}
                            />
                          </div>
                        ))}
                        <p className="text-xs text-muted-foreground">As permissões só entram em vigor após a aceitação. “Executar disparo” não libera envio real sozinho.</p>
                      </div>
                    </>
                  )}
                </div>
              )}
              <Button onClick={handleInvite} disabled={inviting} className="w-full" variant="secondary">
                <Mail className="w-4 h-4 mr-2" />
                {inviting ? "Enviando..." : "Enviar convite"}
              </Button>
              {generatedInvite && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">
                    Link gerado para {generatedInvite.email}. Ele expira em 48 horas.
                  </div>
                  <div className="flex gap-2">
                    <Input value={generatedInvite.url} readOnly aria-label="Link do convite" />
                    <Button type="button" variant="outline" size="icon" onClick={handleCopyInviteLink} title="Copiar link">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Enviar por WhatsApp"
                      onClick={() => window.open(buildWhatsAppHref(generatedInvite.url), "_blank", "noopener,noreferrer")}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium">Convites</div>
                <div className="text-xs text-muted-foreground">
                  Gere um novo link para reenviar manualmente. Nenhum email é enviado nesta ação.
                </div>
              </div>
              {pendingInvites.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-3">Nenhum convite registrado.</div>
              ) : (
                <div className="space-y-2">
                  {pendingInvites.map((inv) => {
                    const state = inviteState(inv);
                    return (
                      <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{inv.responsible_name || inv.email}</div>
                          <div className="text-xs text-muted-foreground truncate">{inv.email}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {state === "used" ? (
                            <Badge variant="secondary">Utilizado</Badge>
                          ) : state === "expired" ? (
                            <Badge variant="destructive">Expirado</Badge>
                          ) : (
                            <Badge variant="outline">Pendente</Badge>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={state === "used" || rotatingId === inv.id}
                            onClick={() => handleRotateAndCopy(inv.id)}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            {rotatingId === inv.id ? "Gerando..." : "Gerar novo link e copiar"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={state === "used" || rotatingId === inv.id}
                            onClick={() => handleRotateAndWhatsApp(inv.id)}
                            title="Gerar novo link e enviar por WhatsApp"
                          >
                            <MessageCircle className="h-3 w-3 mr-1" />
                            WhatsApp
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
