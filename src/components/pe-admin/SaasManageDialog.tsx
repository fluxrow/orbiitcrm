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
import { Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateSaasEmpresa, useSaasPlans, type SaasEmpresa } from "@/hooks/useSaasPlans";

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
  const [inviting, setInviting] = useState(false);

  // Users list
  const [users, setUsers] = useState<any[]>([]);

  const currentEmpresaId = empresa?.empresa_id;

  useEffect(() => {
    if (!currentEmpresaId || !open) return;
    setStatus(empresa?.status || "invited");
    setPlanId(empresa?.plan_id || "");
    setTrialEndsAt(empresa?.trial_ends_at?.slice(0, 10) || "");
    setInviteName(empresa?.responsible_name || "");
    setInviteEmail(empresa?.responsible_email || "");

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
    })();
  }, [currentEmpresaId, open]);

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
        },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error?.message || "Falha ao convidar");
      toast.success(`Convite enviado para ${inviteEmail.trim()}`);
      setInviteName("");
      setInviteEmail("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar convite");
    } finally {
      setInviting(false);
    }
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
              <Button onClick={handleInvite} disabled={inviting} className="w-full" variant="secondary">
                <Mail className="w-4 h-4 mr-2" />
                {inviting ? "Enviando..." : "Enviar convite"}
              </Button>
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
