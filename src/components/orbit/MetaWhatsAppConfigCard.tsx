import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Eye, EyeOff, Loader2, Lock, MessageSquare, Save, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  testMetaWhatsAppConnection,
  useOrbitMetaWhatsAppConfig,
  useUpdateMetaWhatsAppConfig,
} from "@/hooks/useOrbitConfig";

export function MetaWhatsAppConfigCard({ empresaId, disabled = false }: { empresaId: string; disabled?: boolean }) {
  const query = useOrbitMetaWhatsAppConfig(empresaId);
  const update = useUpdateMetaWhatsAppConfig();
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [form, setForm] = useState({
    waba_id: "",
    phone_number_id: "",
    access_token: "",
    app_secret: "",
    graph_api_version: "v25.0",
    ativo: false,
    envio_real_liberado: false,
    canary_mode_enabled: true,
    canary_phone_numbers: "",
    allow_proactive_messages: false,
  });

  useEffect(() => {
    if (!query.data) return;
    setForm((current) => ({
      ...current,
      waba_id: query.data!.waba_id ?? "",
      phone_number_id: query.data!.phone_number_id ?? "",
      access_token: "",
      app_secret: "",
      graph_api_version: query.data!.graph_api_version ?? "v25.0",
      ativo: query.data!.ativo === true,
      envio_real_liberado: query.data!.envio_real_liberado === true,
      canary_mode_enabled: query.data!.canary_mode_enabled !== false,
      canary_phone_numbers: (query.data!.canary_phone_numbers ?? []).join(", "),
      allow_proactive_messages: query.data!.allow_proactive_messages === true,
    }));
  }, [query.data]);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orbit-meta-whatsapp-webhook`;
  const readyToActivate = useMemo(() => !!(
    form.waba_id.trim() && form.phone_number_id.trim() &&
    (form.access_token.trim() || query.data?.has_access_token) &&
    (form.app_secret.trim() || query.data?.has_app_secret)
  ), [form, query.data]);

  const save = async () => {
    if (form.ativo && !readyToActivate) {
      toast.error("Preencha WABA ID, Phone Number ID, token permanente e App Secret antes de ativar.");
      return;
    }
    if (form.envio_real_liberado && !form.ativo) {
      toast.error("Ative o provedor antes de liberar envio real.");
      return;
    }
    try {
      await update.mutateAsync({
        ...form,
        canary_phone_numbers: form.canary_phone_numbers.split(",").map((v) => v.trim()).filter(Boolean),
      });
      setForm((current) => ({ ...current, access_token: "", app_secret: "" }));
      toast.success("Configuração Meta WhatsApp salva com segurança.");
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível salvar a integração Meta.");
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const result = await testMetaWhatsAppConnection(empresaId);
      if (!result.ok) throw new Error(result.error ?? "health_check_failed");
      toast.success(`Meta conectada${result.quality_rating ? ` · qualidade ${result.quality_rating}` : ""}.`);
    } catch (error: any) {
      toast.error(`Falha na validação Meta: ${error?.message ?? "erro desconhecido"}`);
    } finally {
      setTesting(false);
    }
  };

  if (query.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle>WhatsApp Oficial Meta</CardTitle>
          </div>
          <Badge variant={query.data?.ativo ? "default" : "outline"}>
            {query.data?.ativo ? "Ativo" : "Inativo"}
          </Badge>
        </div>
        <CardDescription>Conexão oficial, sem QR Code. Credenciais ficam no Vault e nunca retornam ao navegador.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
          <Lock className="mt-0.5 h-4 w-4 text-primary" />
          <p className="text-xs text-muted-foreground">Salve primeiro com tudo desligado, configure o webhook na Meta, teste a conexão e só então ative. Campanhas continuam bloqueadas separadamente.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>WABA ID</Label><Input value={form.waba_id} onChange={(e) => setForm({ ...form, waba_id: e.target.value })} disabled={disabled} /></div>
          <div className="space-y-2"><Label>Phone Number ID</Label><Input value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} disabled={disabled} /></div>
          <div className="space-y-2"><Label>Token permanente</Label><div className="relative"><Input type={showToken ? "text" : "password"} value={form.access_token} placeholder={query.data?.has_access_token ? "Token já salvo no Vault" : "Cole o token"} onChange={(e) => setForm({ ...form, access_token: e.target.value })} disabled={disabled} /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2" onClick={() => setShowToken(!showToken)}>{showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div></div>
          <div className="space-y-2"><Label>App Secret</Label><div className="relative"><Input type={showSecret ? "text" : "password"} value={form.app_secret} placeholder={query.data?.has_app_secret ? "App Secret já salvo no Vault" : "Cole o App Secret"} onChange={(e) => setForm({ ...form, app_secret: e.target.value })} disabled={disabled} /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2" onClick={() => setShowSecret(!showSecret)}>{showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div></div>
          <div className="space-y-2"><Label>Versão Graph API</Label><Input value={form.graph_api_version} onChange={(e) => setForm({ ...form, graph_api_version: e.target.value })} disabled={disabled} /></div>
          <div className="space-y-2"><Label>Números canário (separados por vírgula)</Label><Input value={form.canary_phone_numbers} onChange={(e) => setForm({ ...form, canary_phone_numbers: e.target.value })} disabled={disabled} /></div>
        </div>

        <div className="space-y-2"><Label>Callback URL</Label><div className="flex gap-2"><Input readOnly value={webhookUrl} className="font-mono text-xs" /><Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL copiada!"); }}><Copy className="h-4 w-4" /></Button></div></div>
        <div className="space-y-2"><Label>Verify token</Label><div className="flex gap-2"><Input readOnly value={query.data?.webhook_verify_token ?? "Salve a configuração para gerar"} className="font-mono text-xs" /><Button variant="outline" size="icon" disabled={!query.data?.webhook_verify_token} onClick={() => { navigator.clipboard.writeText(query.data!.webhook_verify_token); toast.success("Token copiado!"); }}><Copy className="h-4 w-4" /></Button></div></div>

        <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
          <Toggle label="Provedor ativo" checked={form.ativo} onChange={(v) => setForm({ ...form, ativo: v, envio_real_liberado: v ? form.envio_real_liberado : false })} disabled={disabled} />
          <Toggle label="Envio real liberado" checked={form.envio_real_liberado} onChange={(v) => setForm({ ...form, envio_real_liberado: v })} disabled={disabled || !form.ativo} />
          <Toggle label="Modo canário" checked={form.canary_mode_enabled} onChange={(v) => setForm({ ...form, canary_mode_enabled: v })} disabled={disabled} />
          <Toggle label="Campanhas e flows proativos" checked={form.allow_proactive_messages} onChange={(v) => setForm({ ...form, allow_proactive_messages: v })} disabled={disabled || !form.envio_real_liberado} />
        </div>

        {form.allow_proactive_messages && <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs"><ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />Mensagens fora da janela de 24h só saem com template aprovado pela Meta. Ativar esta opção não solta texto livre nem ignora cotas.</div>}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={test} disabled={testing || !readyToActivate || update.isPending}>{testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Testar sem enviar</Button>
          <Button onClick={save} disabled={disabled || update.isPending}>{update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar Meta</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <div className="flex items-center justify-between gap-3"><Label>{label}</Label><Switch checked={checked} onCheckedChange={onChange} disabled={disabled} /></div>;
}
