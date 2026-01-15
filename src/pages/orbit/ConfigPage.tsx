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
import { Bot, MessageSquare, Users, Save, Loader2, Copy } from "lucide-react";
import { useOrbitAIConfig, useUpdateAIConfig, useOrbitZAPIConfig, useUpdateZAPIConfig } from "@/hooks/useOrbitConfig";
import { toast } from "sonner";

export default function ConfigPage() {
  const { data: aiConfig, isLoading: aiLoading } = useOrbitAIConfig();
  const { data: zapiConfig, isLoading: zapiLoading } = useOrbitZAPIConfig();
  const updateAI = useUpdateAIConfig();
  const updateZAPI = useUpdateZAPIConfig();

  const [aiForm, setAiForm] = useState({ modo_automatico: true, tom_conversa: "", prompt_treinamento: "", horario_inicio: "08:00", horario_fim: "18:00" });
  const [zapiForm, setZapiForm] = useState({ instance_id: "", token: "", client_token: "", ativo: false });
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orbit-webhook`;

  useEffect(() => { if (aiConfig) setAiForm({ modo_automatico: aiConfig.modo_automatico ?? true, tom_conversa: aiConfig.tom_conversa || "", prompt_treinamento: aiConfig.prompt_treinamento || "", horario_inicio: aiConfig.horario_inicio || "08:00", horario_fim: aiConfig.horario_fim || "18:00" }); }, [aiConfig]);
  useEffect(() => { if (zapiConfig) setZapiForm({ instance_id: zapiConfig.instance_id || "", token: zapiConfig.token || "", client_token: zapiConfig.client_token || "", ativo: zapiConfig.ativo ?? false }); }, [zapiConfig]);

  const saveAI = async () => { if (aiConfig?.id) { await updateAI.mutateAsync({ id: aiConfig.id, ...aiForm }); toast.success("Salvo!"); } };
  const saveZAPI = async () => { if (zapiConfig?.id) { await updateZAPI.mutateAsync({ id: zapiConfig.id, ...zapiForm }); toast.success("Salvo!"); } };

  return (
    <OrbitLayout>
      <PageHeader title="Configurações" description="Configure IA e integrações" />
      <Tabs defaultValue="ai" className="space-y-6">
        <TabsList><TabsTrigger value="ai"><Bot className="h-4 w-4 mr-2" />IA</TabsTrigger><TabsTrigger value="zapi"><MessageSquare className="h-4 w-4 mr-2" />Z-API</TabsTrigger></TabsList>
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
      </Tabs>
    </OrbitLayout>
  );
}
