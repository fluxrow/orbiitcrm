import { useState, useEffect } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Bot, MessageSquare, Mail, Save, Loader2, Copy, ExternalLink } from "lucide-react";
import { useOrbitAIConfig, useUpdateAIConfig, useOrbitZAPIConfig, useUpdateZAPIConfig, useOrbitResendConfig, useUpdateResendConfig } from "@/hooks/useOrbitConfig";
import { toast } from "sonner";

export default function ConfigPage() {
  const { data: aiConfig, isLoading: aiLoading } = useOrbitAIConfig();
  const { data: zapiConfig, isLoading: zapiLoading } = useOrbitZAPIConfig();
  const { data: resendConfig, isLoading: resendLoading } = useOrbitResendConfig();
  const updateAI = useUpdateAIConfig();
  const updateZAPI = useUpdateZAPIConfig();
  const updateResend = useUpdateResendConfig();

  const [aiForm, setAiForm] = useState({ modo_automatico: true, tom_conversa: "", prompt_treinamento: "", horario_inicio: "08:00", horario_fim: "18:00" });
  const [zapiForm, setZapiForm] = useState({ instance_id: "", token: "", client_token: "", ativo: false });
  const [resendForm, setResendForm] = useState({ from_email: "", from_name: "Orbit CRM", ativo: false });
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orbit-webhook`;

  useEffect(() => { if (aiConfig) setAiForm({ modo_automatico: aiConfig.modo_automatico ?? true, tom_conversa: aiConfig.tom_conversa || "", prompt_treinamento: aiConfig.prompt_treinamento || "", horario_inicio: aiConfig.horario_inicio || "08:00", horario_fim: aiConfig.horario_fim || "18:00" }); }, [aiConfig]);
  useEffect(() => { if (zapiConfig) setZapiForm({ instance_id: zapiConfig.instance_id || "", token: zapiConfig.token || "", client_token: zapiConfig.client_token || "", ativo: zapiConfig.ativo ?? false }); }, [zapiConfig]);
  useEffect(() => { if (resendConfig) setResendForm({ from_email: resendConfig.from_email || "", from_name: resendConfig.from_name || "Orbit CRM", ativo: resendConfig.ativo ?? false }); }, [resendConfig]);

  const saveAI = async () => { await updateAI.mutateAsync({ id: aiConfig?.id, ...aiForm }); toast.success("Salvo!"); };
  const saveZAPI = async () => { await updateZAPI.mutateAsync({ id: zapiConfig?.id, ...zapiForm }); toast.success("Salvo!"); };
  const saveResend = async () => { await updateResend.mutateAsync({ id: resendConfig?.id, ...resendForm }); toast.success("Salvo!"); };

  return (
    <OrbitLayout>
      <PageHeader title="Configurações" description="Configure IA e integrações" />
      <Tabs defaultValue="ai" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ai"><Bot className="h-4 w-4 mr-2" />IA</TabsTrigger>
          <TabsTrigger value="zapi"><MessageSquare className="h-4 w-4 mr-2" />Z-API</TabsTrigger>
          <TabsTrigger value="email"><Mail className="h-4 w-4 mr-2" />Email</TabsTrigger>
        </TabsList>
        <TabsContent value="ai">
          {aiLoading ? <Loader2 className="animate-spin" /> : (
            <Card><CardHeader><CardTitle>Agente IA</CardTitle></CardHeader><CardContent className="space-y-4">
              <div className="flex justify-between"><Label>Modo Automático</Label><Switch checked={aiForm.modo_automatico} onCheckedChange={(v) => setAiForm({ ...aiForm, modo_automatico: v })} /></div>
              <div><Label>Tom</Label><Input value={aiForm.tom_conversa} onChange={(e) => setAiForm({ ...aiForm, tom_conversa: e.target.value })} /></div>
              <div><Label>Prompt</Label><Textarea value={aiForm.prompt_treinamento} onChange={(e) => setAiForm({ ...aiForm, prompt_treinamento: e.target.value })} /></div>
              <Button onClick={saveAI} disabled={updateAI.isPending}><Save className="h-4 w-4 mr-2" />Salvar</Button>
            </CardContent></Card>
          )}
        </TabsContent>
        <TabsContent value="zapi">
          {zapiLoading ? <Loader2 className="animate-spin" /> : (
            <Card><CardHeader><CardTitle>Z-API</CardTitle></CardHeader><CardContent className="space-y-4">
              <div className="flex justify-between"><Label>Ativo</Label><Switch checked={zapiForm.ativo} onCheckedChange={(v) => setZapiForm({ ...zapiForm, ativo: v })} /></div>
              <div><Label>Instance ID</Label><Input value={zapiForm.instance_id} onChange={(e) => setZapiForm({ ...zapiForm, instance_id: e.target.value })} /></div>
              <div><Label>Token</Label><Input type="password" value={zapiForm.token} onChange={(e) => setZapiForm({ ...zapiForm, token: e.target.value })} /></div>
              <div><Label>Webhook URL</Label><div className="flex gap-2"><Input value={webhookUrl} readOnly /><Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Copiado!"); }}><Copy className="h-4 w-4" /></Button></div></div>
              <Button onClick={saveZAPI} disabled={updateZAPI.isPending}><Save className="h-4 w-4 mr-2" />Salvar</Button>
            </CardContent></Card>
          )}
        </TabsContent>
        <TabsContent value="email">
          {resendLoading ? <Loader2 className="animate-spin" /> : (
            <Card>
              <CardHeader>
                <CardTitle>Configuração de Email (Resend)</CardTitle>
                <CardDescription>Configure o envio de emails através do Resend</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Para enviar emails, você precisa de uma conta no Resend e um domínio verificado.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href="https://resend.com" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />Criar conta
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />Validar domínio
                      </a>
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <Label>Envio de emails ativo</Label>
                  <Switch checked={resendForm.ativo} onCheckedChange={(v) => setResendForm({ ...resendForm, ativo: v })} />
                </div>
                <div>
                  <Label>Email remetente</Label>
                  <Input 
                    placeholder="noreply@seudominio.com" 
                    value={resendForm.from_email} 
                    onChange={(e) => setResendForm({ ...resendForm, from_email: e.target.value })} 
                  />
                  <p className="text-xs text-muted-foreground mt-1">O domínio deve estar verificado no Resend</p>
                </div>
                <div>
                  <Label>Nome do remetente</Label>
                  <Input 
                    placeholder="Orbit CRM" 
                    value={resendForm.from_name} 
                    onChange={(e) => setResendForm({ ...resendForm, from_name: e.target.value })} 
                  />
                </div>
                <Button onClick={saveResend} disabled={updateResend.isPending}>
                  <Save className="h-4 w-4 mr-2" />Salvar
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </OrbitLayout>
  );
}
