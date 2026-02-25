import { useState } from "react";
import { PageHeader } from "@/components/orbit/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTrialRequests } from "@/hooks/useTrialRequests";
import { useSaasEmpresas, type SaasEmpresa } from "@/hooks/useSaasPlans";
import { supabase } from "@/integrations/supabase/client";
import { handleApiResponse } from "@/lib/api-envelope";
import { format } from "date-fns";
import { Search, Settings2, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import SaasManageDialog from "@/components/pe-admin/SaasManageDialog";

function statusBadgeTrial(status: string) {
  switch (status) {
    case "approved":
      return <Badge className="bg-green-600 text-white hover:bg-green-700">Aprovado</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejeitado</Badge>;
    default:
      return <Badge className="bg-yellow-500 text-white hover:bg-yellow-600">Pendente</Badge>;
  }
}

function statusBadgeSaas(status: string) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-600 text-white hover:bg-green-700">Ativo</Badge>;
    case "trial":
      return <Badge className="bg-yellow-500 text-white hover:bg-yellow-600">Trial</Badge>;
    case "suspended":
    case "canceled":
      return <Badge variant="destructive">{status === "suspended" ? "Suspenso" : "Cancelado"}</Badge>;
    default:
      return <Badge className="bg-blue-500 text-white hover:bg-blue-600">{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
  }
}

function fmt(dateStr: string | null) {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd/MM/yyyy HH:mm");
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd/MM/yyyy");
}

export default function CadastrosPage() {
  const [searchTrial, setSearchTrial] = useState("");
  const [searchSaas, setSearchSaas] = useState("");
  const { data: trials, isLoading: loadingTrials } = useTrialRequests();
  const { data: saasEmpresas, isLoading: loadingSaas } = useSaasEmpresas();
  const [manageEmpresa, setManageEmpresa] = useState<SaasEmpresa | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const filteredTrials = (trials ?? []).filter((t) => {
    const q = searchTrial.toLowerCase();
    return !q || t.nome.toLowerCase().includes(q) || t.email.toLowerCase().includes(q) || t.empresa.toLowerCase().includes(q);
  });

  const filteredSaas = (saasEmpresas ?? []).filter((s: any) => {
    const q = searchSaas.toLowerCase();
    return !q || (s.responsible_name ?? "").toLowerCase().includes(q) || (s.responsible_email ?? "").toLowerCase().includes(q);
  });

  const handleApprove = async (trial: any) => {
    setApproving(trial.id);
    try {
      const response = await supabase.functions.invoke("auto-approve-trial", {
        body: {
          nome: trial.nome,
          empresa: trial.empresa,
          email: trial.email,
          telefone: trial.telefone,
          plan_code: trial.plan_code,
        },
      });
      handleApiResponse(response);

      // Mark as approved
      await supabase.from("trial_requests").update({ status: "approved" } as any).eq("id", trial.id);
      queryClient.invalidateQueries({ queryKey: ["trial-requests"] });
      queryClient.invalidateQueries({ queryKey: ["saas-empresas"] });
      toast.success("Conta aprovada e convite enviado!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao aprovar");
    } finally {
      setApproving(null);
    }
  };

  const handleResend = async (trial: any) => {
    setApproving(trial.id);
    try {
      const response = await supabase.functions.invoke("auto-approve-trial", {
        body: {
          nome: trial.nome,
          empresa: trial.empresa,
          email: trial.email,
          telefone: trial.telefone,
          plan_code: trial.plan_code,
        },
      });
      handleApiResponse(response);
      toast.success("Convite reenviado!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao reenviar");
    } finally {
      setApproving(null);
    }
  };

  return (
    <div>
      <PageHeader title="Cadastros" description="Pré-cadastros e empresas SaaS provisionadas" />

      <Tabs defaultValue="trials" className="w-full">
        <TabsList>
          <TabsTrigger value="trials">Pré-Cadastros</TabsTrigger>
          <TabsTrigger value="saas">Cadastros SaaS</TabsTrigger>
        </TabsList>

        <TabsContent value="trials">
          <Card className="p-4">
            <div className="relative mb-4 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, email ou empresa..." className="pl-9" value={searchTrial} onChange={(e) => setSearchTrial(e.target.value)} />
            </div>
            {loadingTrials ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrials.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum pré-cadastro encontrado</TableCell>
                    </TableRow>
                  ) : (
                    filteredTrials.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.nome}</TableCell>
                        <TableCell>{t.empresa}</TableCell>
                        <TableCell>{t.email}</TableCell>
                        <TableCell>{t.telefone || "—"}</TableCell>
                        <TableCell><Badge variant="outline">{t.plan_code}</Badge></TableCell>
                        <TableCell>{statusBadgeTrial(t.status)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{fmt(t.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {t.status === "pending" && (
                              <Button size="sm" variant="default" disabled={approving === t.id} onClick={() => handleApprove(t)}>
                                <Play className="w-3 h-3 mr-1" />
                                {approving === t.id ? "..." : "Ativar"}
                              </Button>
                            )}
                            {t.status === "approved" && (
                              <Button size="sm" variant="outline" disabled={approving === t.id} onClick={() => handleResend(t)}>
                                <RotateCcw className="w-3 h-3 mr-1" />
                                {approving === t.id ? "..." : "Reenviar"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="saas">
          <Card className="p-4">
            <div className="relative mb-4 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por responsável ou email..." className="pl-9" value={searchSaas} onChange={(e) => setSearchSaas(e.target.value)} />
            </div>
            {loadingSaas ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Convidado em</TableHead>
                    <TableHead>Ativado em</TableHead>
                    <TableHead>Trial expira</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSaas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum cadastro SaaS encontrado</TableCell>
                    </TableRow>
                  ) : (
                    filteredSaas.map((s: any) => (
                      <TableRow key={s.empresa_id}>
                        <TableCell className="font-medium">{s.responsible_name || "—"}</TableCell>
                        <TableCell>{s.responsible_email || "—"}</TableCell>
                        <TableCell><Badge variant="outline">{s.saas_plans?.name || "—"}</Badge></TableCell>
                        <TableCell>{statusBadgeSaas(s.status)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{fmt(s.invited_at)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{fmt(s.activated_at)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{fmtDate(s.trial_ends_at)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => { setManageEmpresa(s); setManageOpen(true); }}>
                            <Settings2 className="w-3 h-3 mr-1" />
                            Gerenciar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <SaasManageDialog open={manageOpen} onOpenChange={setManageOpen} empresa={manageEmpresa} />
    </div>
  );
}
