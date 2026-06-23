import { useState, useEffect, useRef, useMemo } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { usePeAuth } from "@/hooks/usePeAuth";
import { useTenant } from "@/contexts/TenantContext";
import ConfigUsersTab from "@/components/orbit/ConfigUsersTab";
import { Users, Phone } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Bot, MessageSquare, Mail, Save, Loader2, Copy, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Send, Upload, Download, FileText, X, Settings2, Info, Link2, ClipboardList, Clock, Music2, Volume2, Mic } from "lucide-react";
import { AudioLibraryManager } from "@/components/orbit/AudioLibraryManager";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useOrbitAIConfig, useUpdateAIConfig, useOrbitZAPIConfig, useUpdateZAPIConfig, useOrbitResendConfig, useUpdateResendConfig, useTestResendConnection, useWhatsAppSendingConfig, useUpdateWhatsAppSendingConfig, useWhatsAppDailyUsage } from "@/hooks/useOrbitConfig";
import { parseCSV, generateCSVTemplate, useImportProspects, useImportHistory } from "@/hooks/useImportProspects";
import { toast } from "sonner";
import { useIsDemo } from "@/hooks/useIsDemo";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ParsedProspect {
  nome_razao: string;
  nome_fantasia?: string;
  tipo?: string;
  cnpj_cpf?: string;
  email_principal?: string;
  telefone?: string;
  whatsapp?: string;
  whatsapp_status?: string;
  cidade?: string;
  estado?: string;
  segmento?: string;
  origem_lead?: string;
  observacoes?: string;
  tags?: string[];
}

export default function ConfigPage() {
  const { roleCode } = usePeAuth();
  const { empresaId } = useTenant();
  const isOrgAdmin = roleCode === "ORG_ADMIN";
  const { isDemo } = useIsDemo();
  const { data: aiConfig, isLoading: aiLoading } = useOrbitAIConfig(empresaId);
  const { data: zapiConfig, isLoading: zapiLoading } = useOrbitZAPIConfig(empresaId);
  const { data: resendConfig, isLoading: resendLoading } = useOrbitResendConfig(empresaId);
  const { data: importHistory, isLoading: historyLoading } = useImportHistory();
  const updateAI = useUpdateAIConfig();
  const updateZAPI = useUpdateZAPIConfig();
  const updateResend = useUpdateResendConfig();
  const testConnection = useTestResendConnection();
  const importProspects = useImportProspects();
  const { data: sendingConfig, isLoading: sendingConfigLoading } = useWhatsAppSendingConfig(empresaId);
  const { data: dailyUsage } = useWhatsAppDailyUsage(empresaId);
  const updateSendingConfig = useUpdateWhatsAppSendingConfig();

  const [aiForm, setAiForm] = useState({ 
    modo_automatico: true, 
    tom_conversa: "profissional", 
    prompt_treinamento: "", 
    horario_inicio: "08:00", 
    horario_fim: "18:00",
    responder_fora_horario: false,
    mensagem_fora_horario: "Olá! Nosso horário de atendimento é das 08h às 18h. Deixe sua mensagem que retornaremos assim que possível!",
    idioma: "pt-BR",
    max_tokens: 500,
    tempo_espera: 10,
    prompt_orcamentos: "",
    campos_cadastro: ["nome_razao", "nome_fantasia", "email_principal", "cidade", "segmento"] as string[]
  });
const [zapiForm, setZapiForm] = useState({ nome_instancia: "", instance_id: "", token: "", client_token: "", numero_origem: "", notificar_enviadas_por_mim: false, ativo: false });
  const [showZapiToken, setShowZapiToken] = useState(false);
  const [showZapiClientToken, setShowZapiClientToken] = useState(false);
  const [testingZapiConnection, setTestingZapiConnection] = useState(false);
  const [resendForm, setResendForm] = useState({ 
    api_key: "", 
    email_teste: "", 
    from_email: "", 
    from_name: "Orbit CRM", 
    dominio_verificado: "",
    ativo: false 
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const hasStoredZapiToken = !!zapiConfig?.has_token;
  const hasStoredZapiClientToken = !!zapiConfig?.has_client_token;
  
  // Import states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedProspects, setParsedProspects] = useState<ParsedProspect[]>([]);
  const [parseErrors, setParseErrors] = useState<{ row: number; field: string; message: string }[]>([]);
  const [ignoreDuplicates, setIgnoreDuplicates] = useState(true);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [rateForm, setRateForm] = useState({
    min_delay_ms: 1500,
    max_delay_ms: 3500,
    batch_size: 50,
    batch_pause_ms: 30000,
    daily_limit: 500,
    max_per_minute: 15,
    warmup_enabled: false,
    warmup_start_date: "",
    enabled: true,
  });
  
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orbit-webhook`;
  const emailWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orbit-send-email`;

  useEffect(() => { 
    if (aiConfig) setAiForm({ 
      modo_automatico: aiConfig.modo_automatico ?? true, 
      tom_conversa: aiConfig.tom_conversa || "profissional", 
      prompt_treinamento: aiConfig.prompt_treinamento || "", 
      horario_inicio: aiConfig.horario_inicio || "08:00", 
      horario_fim: aiConfig.horario_fim || "18:00",
      responder_fora_horario: aiConfig.responder_fora_horario ?? false,
      mensagem_fora_horario: aiConfig.mensagem_fora_horario || "Olá! Nosso horário de atendimento é das 08h às 18h. Deixe sua mensagem que retornaremos assim que possível!",
      idioma: (aiConfig as any).idioma || "pt-BR",
      max_tokens: (aiConfig as any).max_tokens || 500,
      tempo_espera: (aiConfig as any).tempo_espera || 10,
      prompt_orcamentos: (aiConfig as any).prompt_orcamentos || "",
      campos_cadastro: aiConfig.campos_cadastro || ["nome_razao", "nome_fantasia", "email_principal", "cidade", "segmento"]
    }); 
  }, [aiConfig]);
  useEffect(() => { 
    if (zapiConfig) setZapiForm({ 
      nome_instancia: (zapiConfig as any).nome_instancia || "", 
      instance_id: zapiConfig.instance_id || "", 
      token: "",
      client_token: "",
      numero_origem: (zapiConfig as any).numero_origem || "",
      notificar_enviadas_por_mim: (zapiConfig as any).notificar_enviadas_por_mim ?? false,
      ativo: zapiConfig.ativo ?? false 
    }); 
  }, [zapiConfig]);
  useEffect(() => { 
    if (resendConfig) setResendForm({ 
      api_key: resendConfig.api_key || "", 
      email_teste: resendConfig.email_teste || "", 
      from_email: resendConfig.from_email || "", 
      from_name: resendConfig.from_name || "Orbit CRM", 
      dominio_verificado: resendConfig.dominio_verificado || "",
      ativo: resendConfig.ativo ?? false 
    }); 
  }, [resendConfig]);
  useEffect(() => {
    if (sendingConfig) setRateForm({
      min_delay_ms: sendingConfig.min_delay_ms ?? 1500,
      max_delay_ms: sendingConfig.max_delay_ms ?? 3500,
      batch_size: sendingConfig.batch_size ?? 50,
      batch_pause_ms: sendingConfig.batch_pause_ms ?? 30000,
      daily_limit: sendingConfig.daily_limit ?? 500,
      max_per_minute: sendingConfig.max_per_minute ?? 15,
      warmup_enabled: sendingConfig.warmup_enabled ?? false,
      warmup_start_date: sendingConfig.warmup_start_date || "",
      enabled: sendingConfig.enabled ?? true,
    });
  }, [sendingConfig]);

  const saveAI = async () => { await updateAI.mutateAsync({ id: aiConfig?.id, ...aiForm, empresa_id: empresaId }); toast.success("Salvo!"); };
  const saveZAPI = async () => {
    if (!empresaId) {
      toast.error("Empresa não identificada. Recarregue a página e tente novamente.");
      return;
    }

    if (!zapiForm.instance_id.trim()) {
      toast.error("Informe o ID da instância antes de salvar.");
      return;
    }

    if (!zapiForm.token.trim() && !hasStoredZapiToken) {
      toast.error("Informe o Token da instância antes de salvar.");
      return;
    }

    if (!zapiForm.client_token.trim() && !hasStoredZapiClientToken) {
      toast.error("Informe o Client Token antes de salvar.");
      return;
    }

    try {
      const saved = await updateZAPI.mutateAsync({
        id: zapiConfig?.id,
        ...zapiForm,
        empresa_id: empresaId,
        instance_id: zapiForm.instance_id.trim(),
        token: zapiForm.token.trim(),
        client_token: zapiForm.client_token.trim(),
        numero_origem: zapiForm.numero_origem.trim(),
        webhook_url: webhookUrl,
        ativo: true,
      });

      if (!saved?.id || !saved?.has_token || !saved?.has_client_token) {
        throw new Error("A configuração não foi confirmada pelo banco. Tente salvar novamente.");
      }

      setZapiForm((current) => ({ ...current, token: "", client_token: "", ativo: saved.ativo ?? true }));
      toast.success("Configuração Z-API salva e confirmada.");
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar configuração Z-API");
    }
  };
  
  const saveResendApiKey = async () => { 
    await updateResend.mutateAsync({ 
      id: resendConfig?.id, 
      empresa_id: empresaId,
      api_key: resendForm.api_key,
      email_teste: resendForm.email_teste 
    }); 
    toast.success("API Key salva!"); 
  };

  const saveResendCampaigns = async () => { 
    await updateResend.mutateAsync({ 
      id: resendConfig?.id, 
      empresa_id: empresaId,
      from_email: resendForm.from_email,
      from_name: resendForm.from_name,
      dominio_verificado: resendForm.dominio_verificado,
      ativo: resendForm.ativo 
    }); 
    toast.success("Configurações de campanhas salvas!"); 
  };

  const handleTestConnection = async () => {
    if (!resendForm.email_teste) {
      toast.error("Informe um email de teste");
      return;
    }
    try {
      await testConnection.mutateAsync({ 
        email: resendForm.email_teste,
        empresa_id: resendConfig?.empresa_id 
      });
      toast.success("Email de teste enviado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao testar conexão");
    }
  };

  const getMaskedApiKey = (key: string) => {
    if (!key || key.length < 4) return "";
    return "**** " + key.slice(-4);
  };

  const isApiKeyConfigured = !!resendConfig?.api_key;

  // CSV Import functions
  const handleDownloadTemplate = () => {
    const csv = generateCSVTemplate();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_prospects.csv';
    link.click();
    toast.success("Template baixado!");
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error("Por favor, selecione um arquivo CSV");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo: 5MB");
      return;
    }

    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { prospects, errors } = parseCSV(text);
      
      if (prospects.length > 1000) {
        toast.error("Máximo de 1000 registros por importação");
        setParsedProspects(prospects.slice(0, 1000));
      } else {
        setParsedProspects(prospects);
      }
      setParseErrors(errors);

      if (errors.length > 0) {
        toast.warning(`${errors.length} erro(s) encontrado(s) no arquivo`);
      }
    };
    reader.readAsText(file);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setParsedProspects([]);
    setParseErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (parsedProspects.length === 0) {
      toast.error("Nenhum registro para importar");
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    // Simulate progress
    const interval = setInterval(() => {
      setImportProgress(prev => Math.min(prev + 10, 90));
    }, 200);

    try {
      const result = await importProspects.mutateAsync({
        prospects: parsedProspects,
        fileName: selectedFile?.name || 'import.csv',
        ignoreDuplicates
      });

      clearInterval(interval);
      setImportProgress(100);

      toast.success(`Importação concluída! ${result.success} importados, ${result.errors} erros`);
      
      // Clear after success
      setTimeout(() => {
        handleClearFile();
        setImportProgress(0);
        setIsImporting(false);
      }, 1500);
    } catch (error: any) {
      clearInterval(interval);
      toast.error(error.message || "Erro na importação");
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  return (
    <OrbitLayout>
      <PageHeader title="Configurações" description="Configure IA e integrações" />
      <Tabs defaultValue="ai" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ai"><Bot className="h-4 w-4 mr-2" />IA</TabsTrigger>
          <TabsTrigger value="zapi"><MessageSquare className="h-4 w-4 mr-2" />Z-API</TabsTrigger>
          <TabsTrigger value="email"><Mail className="h-4 w-4 mr-2" />Email</TabsTrigger>
          <TabsTrigger value="import"><Upload className="h-4 w-4 mr-2" />Importar</TabsTrigger>
          <TabsTrigger value="audios"><Music2 className="h-4 w-4 mr-2" />Áudios</TabsTrigger>
          {isOrgAdmin && <TabsTrigger value="users"><Users className="h-4 w-4 mr-2" />Usuários</TabsTrigger>}
        </TabsList>
        <TabsContent value="ai">
          {aiLoading ? <Loader2 className="animate-spin" /> : (
            <div className="space-y-6">
              {/* Card 1: Configuração de IA */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="h-5 w-5 text-primary" />
                      <CardTitle>Configuração de IA</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="ia-ativa" className="text-sm">IA Ativa</Label>
                      <Switch 
                        id="ia-ativa"
                        checked={aiForm.modo_automatico} 
                        onCheckedChange={(v) => setAiForm({ ...aiForm, modo_automatico: v })} 
                      />
                    </div>
                  </div>
                  <CardDescription>Configure o treinamento da IA para geração de mensagens</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Texto de Treinamento */}
                  <div className="space-y-2">
                    <Label>Texto de Treinamento *</Label>
                    <Textarea 
                      className="min-h-[150px]"
                      placeholder="Você é um assistente de vendas profissional. Seu objetivo é iniciar conversas com prospects de forma amigável e identificar suas necessidades..."
                      value={aiForm.prompt_treinamento} 
                      onChange={(e) => setAiForm({ ...aiForm, prompt_treinamento: e.target.value })} 
                    />
                    <p className="text-xs text-muted-foreground">Este texto será usado como contexto para gerar mensagens personalizadas</p>
                  </div>

                  {/* Tom, Idioma, Max Tokens */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Tom da Conversa</Label>
                      <Select 
                        value={aiForm.tom_conversa} 
                        onValueChange={(v) => setAiForm({ ...aiForm, tom_conversa: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tom" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="profissional">Profissional</SelectItem>
                          <SelectItem value="amigavel">Amigável</SelectItem>
                          <SelectItem value="formal">Formal</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Idioma</Label>
                      <Select 
                        value={aiForm.idioma} 
                        onValueChange={(v) => setAiForm({ ...aiForm, idioma: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o idioma" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pt-BR">Português (BR)</SelectItem>
                          <SelectItem value="en">Inglês</SelectItem>
                          <SelectItem value="es">Espanhol</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Máx. Tokens</Label>
                      <Input 
                        type="number"
                        min={100}
                        max={2000}
                        value={aiForm.max_tokens} 
                        onChange={(e) => setAiForm({ ...aiForm, max_tokens: parseInt(e.target.value) || 500 })} 
                      />
                      <p className="text-xs text-muted-foreground">Limite de tamanho da resposta</p>
                    </div>
                  </div>

                  {/* Tempo de Espera */}
                  <div className="space-y-2">
                    <Label>Tempo de Espera (segundos)</Label>
                    <Input 
                      type="number"
                      min={0}
                      max={60}
                      value={aiForm.tempo_espera} 
                      onChange={(e) => setAiForm({ ...aiForm, tempo_espera: parseInt(e.target.value) || 0 })} 
                    />
                    <p className="text-xs text-muted-foreground">Tempo que a IA aguarda antes de responder (0 = imediato)</p>
                  </div>

                  <Button onClick={saveAI} disabled={updateAI.isPending}>
                    {updateAI.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar Configurações de IA
                  </Button>
              </CardContent>
            </Card>

            {/* Card 2: Horário de Atendimento */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <CardTitle>Horário de Atendimento</CardTitle>
                </div>
                <CardDescription>Defina quando a IA pode responder automaticamente e a mensagem fora do horário</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Início do atendimento</Label>
                    <Input 
                      type="time"
                      value={aiForm.horario_inicio} 
                      onChange={(e) => setAiForm({ ...aiForm, horario_inicio: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fim do atendimento</Label>
                    <Input 
                      type="time"
                      value={aiForm.horario_fim} 
                      onChange={(e) => setAiForm({ ...aiForm, horario_fim: e.target.value })} 
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <Label className="text-base font-medium">Responder fora do horário</Label>
                    <p className="text-sm text-muted-foreground">Quando ativo, a IA envia uma mensagem automática fora do horário de atendimento</p>
                  </div>
                  <Switch 
                    checked={aiForm.responder_fora_horario} 
                    onCheckedChange={(v) => setAiForm({ ...aiForm, responder_fora_horario: v })} 
                  />
                </div>

                {aiForm.responder_fora_horario && (
                  <div className="space-y-2">
                    <Label>Mensagem fora do horário</Label>
                    <Textarea 
                      className="min-h-[80px]"
                      placeholder="Olá! Nosso horário de atendimento é das 08h às 18h..."
                      value={aiForm.mensagem_fora_horario} 
                      onChange={(e) => setAiForm({ ...aiForm, mensagem_fora_horario: e.target.value })} 
                    />
                    <p className="text-xs text-muted-foreground">Mensagem enviada automaticamente quando o prospect envia mensagem fora do horário</p>
                  </div>
                )}

                <Button onClick={saveAI} disabled={updateAI.isPending}>
                  {updateAI.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar Horário de Atendimento
                </Button>
              </CardContent>
            </Card>

            {/* Card 3: Automação de Conversas */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5 text-primary" />
                    <CardTitle>Automação de Conversas</CardTitle>
                  </div>
                  <CardDescription>Configure a IA para responder automaticamente às mensagens recebidas</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Modo Automático */}
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <Label className="text-base font-medium">Modo Automático</Label>
                      <p className="text-sm text-muted-foreground">Quando ativo, a IA responde automaticamente às mensagens recebidas</p>
                    </div>
                    <Switch 
                      checked={aiForm.modo_automatico} 
                      onCheckedChange={(v) => setAiForm({ ...aiForm, modo_automatico: v })} 
                    />
                  </div>

                  {/* Prompt para Orçamentos */}
                  <div className="space-y-2">
                    <Label>Prompt para Orçamentos</Label>
                    <Textarea 
                      className="min-h-[100px]"
                      placeholder="Quando o prospect mencionar orçamento, cotação, preço ou valores, colete os seguintes dados: nome da empresa, email, telefone e descrição do que precisa..."
                      value={aiForm.prompt_orcamentos} 
                      onChange={(e) => setAiForm({ ...aiForm, prompt_orcamentos: e.target.value })} 
                    />
                    <p className="text-xs text-muted-foreground">Este prompt será usado quando a IA detectar que o prospect quer um orçamento</p>
                  </div>

                  {/* Campos a Coletar */}
                  <div className="space-y-3">
                    <div>
                      <Label className="text-base">Campos a Coletar</Label>
                      <p className="text-sm text-muted-foreground">Selecione os campos que a IA deve coletar do prospect durante a conversa</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { value: "nome_razao", label: "Nome/Razão Social" },
                        { value: "nome_fantasia", label: "Nome Fantasia" },
                        { value: "email_principal", label: "Email" },
                        { value: "cidade", label: "Cidade" },
                        { value: "segmento", label: "Segmento" },
                        { value: "telefone_comercial", label: "Telefone Comercial" },
                      ].map(campo => (
                        <div key={campo.value} className="flex items-center space-x-2">
                          <Checkbox 
                            id={campo.value}
                            checked={aiForm.campos_cadastro.includes(campo.value)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setAiForm({ ...aiForm, campos_cadastro: [...aiForm.campos_cadastro, campo.value] });
                              } else {
                                setAiForm({ ...aiForm, campos_cadastro: aiForm.campos_cadastro.filter(c => c !== campo.value) });
                              }
                            }}
                          />
                          <label htmlFor={campo.value} className="text-sm cursor-pointer">{campo.label}</label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Info Box - Fluxo Automático */}
                  <div className="p-4 bg-muted rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">Como funciona o fluxo automático:</p>
                    </div>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li><strong>Mensagem recebida:</strong> Prospect envia mensagem via WhatsApp</li>
                      <li><strong>Classificação:</strong> IA identifica a intenção (orçamento, suporte, informação, outro)</li>
                      <li><strong>Ação:</strong>
                        <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                          <li><strong>Orçamento:</strong> Coleta dados configurados acima e atualiza o cadastro</li>
                          <li><strong>Suporte/Outro:</strong> Transfere para atendimento humano</li>
                          <li><strong>Informação:</strong> Responde com base no treinamento</li>
                        </ul>
                      </li>
                      <li><strong>Resposta:</strong> IA envia resposta automática via Z-API</li>
                    </ol>
                  </div>

                  <Button onClick={saveAI} disabled={updateAI.isPending}>
                    {updateAI.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar Configurações de Automação
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
        <TabsContent value="zapi">
            <div className="space-y-6">
            {isDemo && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Modo Demo — Integrações externas desabilitadas. Disponível apenas em planos pagos.</span>
              </div>
            )}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  <CardTitle>Integração Z-API</CardTitle>
                </div>
                <CardDescription>Configure sua instância Z-API para envio de mensagens WhatsApp</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/40 p-4">
                  <Lock className="mt-0.5 h-4 w-4 text-primary" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Secrets protegidos no Supabase Vault</p>
                    <p className="text-xs text-muted-foreground">
                      Tokens já salvos ficam mascarados e não são mais lidos direto do banco. Deixe os campos vazios para manter os valores atuais.
                    </p>
                  </div>
                </div>

                {/* Status Ativo */}
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <Label className="text-base font-medium">Integração Ativa</Label>
                    <p className="text-sm text-muted-foreground">Ative para habilitar o envio de mensagens via WhatsApp</p>
                  </div>
                  <Switch checked={zapiForm.ativo} onCheckedChange={(v) => setZapiForm({ ...zapiForm, ativo: v })} disabled={isDemo} />
                </div>

                {/* Nome da instância */}
                <div className="space-y-2">
                  <Label>Nome da instância</Label>
                  <Input 
                    placeholder="Ex: Match-FluxRow" 
                    value={zapiForm.nome_instancia} 
                    onChange={(e) => setZapiForm({ ...zapiForm, nome_instancia: e.target.value })}
                    disabled={isDemo}
                  />
                  
                  <p className="text-xs text-muted-foreground">Nome para identificar sua instância (opcional)</p>
                </div>

                {/* ID e Token da instância */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>ID da instância *</Label>
                    <Input 
                      placeholder="3EBCAD9A3C0711696E74E6B9" 
                      value={zapiForm.instance_id} 
                      onChange={(e) => setZapiForm({ ...zapiForm, instance_id: e.target.value })}
                      disabled={isDemo}
                    
                    />
                    <p className="text-xs text-muted-foreground">Encontre em "Dados da instância" → "ID da instância" no painel Z-API</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Token da instância *</Label>
                    <div className="relative">
                      <Input 
                        type={showZapiToken ? "text" : "password"}
                        placeholder={hasStoredZapiToken ? "Token já salvo no Vault" : "Token da instância"}
                        value={zapiForm.token} 
                        onChange={(e) => setZapiForm({ ...zapiForm, token: e.target.value })}
                        disabled={isDemo}
                      
                      />
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="icon" 
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setShowZapiToken(!showZapiToken)}
                      >
                        {showZapiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {hasStoredZapiToken
                        ? 'Já existe um token salvo com segurança. Preencha apenas se quiser substituir o valor atual.'
                        : 'Encontre em "Dados da instância" → "Token da instância" no painel Z-API'}
                    </p>
                  </div>
                </div>

                {/* Client Token e Número de Origem */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Client Token *</Label>
                    <div className="relative">
                      <Input 
                        type={showZapiClientToken ? "text" : "password"}
                        placeholder={hasStoredZapiClientToken ? "Client Token já salvo no Vault" : "Client Token"}
                        value={zapiForm.client_token} 
                        onChange={(e) => setZapiForm({ ...zapiForm, client_token: e.target.value })}
                        disabled={isDemo}
                      
                      />
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="icon" 
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setShowZapiClientToken(!showZapiClientToken)}
                      >
                        {showZapiClientToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {hasStoredZapiClientToken
                        ? 'Já existe um Client Token salvo com segurança. Preencha apenas se quiser substituir o valor atual.'
                        : 'Configure em "Segurança" → "Client Token" no painel Z-API'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Número de Origem</Label>
                    <Input 
                      placeholder="+5511937273838" 
                      value={zapiForm.numero_origem} 
                      onChange={(e) => setZapiForm({ ...zapiForm, numero_origem: e.target.value })}
                      disabled={isDemo}
                    
                    />
                    <p className="text-xs text-muted-foreground">Número WhatsApp conectado à instância</p>
                  </div>
                </div>

                {/* API URL gerada */}
                {zapiForm.instance_id && zapiForm.token && (
                  <div className="space-y-2">
                    <Label>API da instância</Label>
                    <div className="flex gap-2">
                      <Input 
                        value={`https://api.z-api.io/instances/${zapiForm.instance_id}/token/${zapiForm.token}/send-text`} 
                        readOnly 
                        className="font-mono text-xs"
                      />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={() => { 
                          navigator.clipboard.writeText(`https://api.z-api.io/instances/${zapiForm.instance_id}/token/${zapiForm.token}/send-text`); 
                          toast.success("Copiado!"); 
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {zapiForm.instance_id && !zapiForm.token && hasStoredZapiToken && (
                  <p className="text-xs text-muted-foreground">
                    O token da instância já está salvo no Vault. Para copiar a URL completa da API ou testar via navegador, reinsira o token temporariamente neste formulário.
                  </p>
                )}

                {/* Webhook URL */}
                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <div className="flex gap-2">
                    <Input value={webhookUrl} readOnly className="font-mono text-sm" />
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Copiado!"); }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Configure este URL em "Webhooks" → "On Message Received" no painel Z-API</p>
                </div>

                {/* Instruções */}
                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <p className="text-sm font-medium">Como configurar:</p>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>
                      Acesse{" "}
                      <a href="https://z-api.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        z-api.io
                      </a>{" "}
                      e crie uma instância
                    </li>
                    <li>Copie o ID e Token da instância dos "Dados da instância"</li>
                    <li>Configure o Client Token em "Segurança"</li>
                    <li>Configure o Webhook URL acima em "Webhooks"</li>
                    <li>Conecte seu WhatsApp escaneando o QR Code</li>
                  </ol>
                </div>

                {/* Botões de ação */}
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={async () => {
                      if (!zapiForm.instance_id || !zapiForm.token) {
                        toast.error("Preencha o ID e Token da instância para testar localmente");
                        return;
                      }
                      setTestingZapiConnection(true);
                      try {
                        const response = await fetch(
                          `https://api.z-api.io/instances/${zapiForm.instance_id}/token/${zapiForm.token}/status`,
                          {
                            method: "GET",
                            headers: { "Client-Token": zapiForm.client_token }
                          }
                        );
                        if (response.ok) {
                          const data = await response.json();
                          if (data.connected) {
                            toast.success("Conexão estabelecida! WhatsApp conectado.");
                          } else {
                            toast.warning("Instância encontrada, mas WhatsApp não conectado. Escaneie o QR Code no painel Z-API.");
                          }
                        } else {
                          toast.error("Não foi possível conectar. Verifique as credenciais.");
                        }
                      } catch (error) {
                        toast.error("Erro ao testar conexão. Verifique as credenciais.");
                      } finally {
                        setTestingZapiConnection(false);
                      }
                    }} 
                    disabled={testingZapiConnection || !zapiForm.instance_id || !zapiForm.token}
                  >
                    {testingZapiConnection ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <MessageSquare className="h-4 w-4 mr-2" />
                    )}
                    Testar Conexão
                  </Button>
                   <Button onClick={saveZAPI} disabled={updateZAPI.isPending || isDemo}>
                    {updateZAPI.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar Configuração
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Configure Webhooks */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Link2 className="h-5 w-5 text-primary" />
                  <CardTitle>Configure webhooks</CardTitle>
                </div>
                <CardDescription>Configure estas URLs na seção "Webhooks" do painel Z-API para receber eventos automaticamente</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Webhooks Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Ao enviar */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Send className="h-4 w-4" />
                      Ao enviar
                    </Label>
                    <div className="flex gap-2">
                      <Input 
                        value={`${webhookUrl}?event=on-send`} 
                        readOnly 
                        className="font-mono text-xs"
                      />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={() => { 
                          navigator.clipboard.writeText(`${webhookUrl}?event=on-send`); 
                          toast.success("URL copiada!"); 
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Notificação quando mensagem é enviada</p>
                  </div>

                  {/* Presença do chat */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Presença do chat
                    </Label>
                    <div className="flex gap-2">
                      <Input 
                        value={`${webhookUrl}?event=presence`} 
                        readOnly 
                        className="font-mono text-xs"
                      />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={() => { 
                          navigator.clipboard.writeText(`${webhookUrl}?event=presence`); 
                          toast.success("URL copiada!"); 
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Digitando, online, offline</p>
                  </div>

                  {/* Ao desconectar */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Ao desconectar
                    </Label>
                    <div className="flex gap-2">
                      <Input 
                        value={`${webhookUrl}?event=on-disconnect`} 
                        readOnly 
                        className="font-mono text-xs"
                      />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={() => { 
                          navigator.clipboard.writeText(`${webhookUrl}?event=on-disconnect`); 
                          toast.success("URL copiada!"); 
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Quando instância desconecta</p>
                  </div>

                  {/* Receber status mensagem */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Receber status mensagem
                    </Label>
                    <div className="flex gap-2">
                      <Input 
                        value={`${webhookUrl}?event=message-status`} 
                        readOnly 
                        className="font-mono text-xs"
                      />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={() => { 
                          navigator.clipboard.writeText(`${webhookUrl}?event=message-status`); 
                          toast.success("URL copiada!"); 
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Entregue, lido, falhou</p>
                  </div>

                  {/* Ao receber */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      Ao receber
                    </Label>
                    <div className="flex gap-2">
                      <Input 
                        value={`${webhookUrl}?event=on-receive`} 
                        readOnly 
                        className="font-mono text-xs"
                      />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={() => { 
                          navigator.clipboard.writeText(`${webhookUrl}?event=on-receive`); 
                          toast.success("URL copiada!"); 
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Quando recebe mensagem</p>
                  </div>

                  {/* Ao conectar */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Link2 className="h-4 w-4" />
                      Ao conectar
                    </Label>
                    <div className="flex gap-2">
                      <Input 
                        value={`${webhookUrl}?event=on-connect`} 
                        readOnly 
                        className="font-mono text-xs"
                      />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={() => { 
                          navigator.clipboard.writeText(`${webhookUrl}?event=on-connect`); 
                          toast.success("URL copiada!"); 
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Quando instância conecta</p>
                  </div>
                </div>

                {/* Toggle: Notificar as enviadas por mim */}
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <Label className="text-base font-medium">Notificar as enviadas por mim também</Label>
                    <p className="text-sm text-muted-foreground">Receber webhook quando você mesmo envia mensagens</p>
                  </div>
                    <Switch 
                      checked={zapiForm.notificar_enviadas_por_mim} 
                      onCheckedChange={(v) => setZapiForm({ ...zapiForm, notificar_enviadas_por_mim: v })}
                      disabled={isDemo}
                  
                  />
                </div>

                {/* Instruções de configuração */}
                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg space-y-3">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Info className="h-4 w-4 text-blue-600" />
                    Como configurar na Z-API:
                  </p>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Acesse sua instância no painel Z-API</li>
                    <li>Vá em "Webhooks" no menu lateral</li>
                    <li>Cole cada URL no campo correspondente</li>
                    <li>Ative os webhooks que deseja receber</li>
                    <li>Clique em "Salvar" na Z-API</li>
                  </ol>
                </div>

                {/* Botões de ação */}
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      const webhooks = [
                        `Ao enviar: ${webhookUrl}?event=on-send`,
                        `Presença do chat: ${webhookUrl}?event=presence`,
                        `Ao desconectar: ${webhookUrl}?event=on-disconnect`,
                        `Receber status mensagem: ${webhookUrl}?event=message-status`,
                        `Ao receber: ${webhookUrl}?event=on-receive`,
                        `Ao conectar: ${webhookUrl}?event=on-connect`,
                      ].join('\n');
                      navigator.clipboard.writeText(webhooks);
                      toast.success("Todas as URLs copiadas!");
                    }}
                  >
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Copiar Todas as URLs
                  </Button>
                  <Button onClick={saveZAPI} disabled={updateZAPI.isPending || isDemo}>
                    {updateZAPI.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar Configurações
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Controle de Ritmo */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-primary" />
                  <CardTitle>Controle de Ritmo (Anti-Bloqueio)</CardTitle>
                </div>
                <CardDescription>Configure delays, lotes e limites para evitar bloqueios do WhatsApp</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Status Ativo */}
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <Label className="text-base font-medium">Controle de Ritmo Ativo</Label>
                    <p className="text-sm text-muted-foreground">Quando ativo, aplica delays e limites nos envios</p>
                  </div>
                  <Switch checked={rateForm.enabled} onCheckedChange={(v) => setRateForm({ ...rateForm, enabled: v })} disabled={isDemo} />
                </div>

                {/* Daily Usage Counter */}
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-base font-medium">Enviados Hoje</Label>
                    <span className="text-sm font-mono">{dailyUsage?.sent_count || 0} / {rateForm.daily_limit}</span>
                  </div>
                  <Progress value={((dailyUsage?.sent_count || 0) / rateForm.daily_limit) * 100} className="h-2" />
                </div>

                {/* Delay Config */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Delay Mínimo (ms)</Label>
                    <Input type="number" min={500} max={10000} value={rateForm.min_delay_ms} onChange={(e) => setRateForm({ ...rateForm, min_delay_ms: parseInt(e.target.value) || 1500 })} disabled={isDemo} />
                    <p className="text-xs text-muted-foreground">Padrão: 1500ms (1.5s)</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Delay Máximo (ms)</Label>
                    <Input type="number" min={1000} max={15000} value={rateForm.max_delay_ms} onChange={(e) => setRateForm({ ...rateForm, max_delay_ms: parseInt(e.target.value) || 3500 })} disabled={isDemo} />
                    <p className="text-xs text-muted-foreground">Padrão: 3500ms (3.5s)</p>
                  </div>
                </div>

                {/* Batch Config */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tamanho do Lote</Label>
                    <Input type="number" min={10} max={200} value={rateForm.batch_size} onChange={(e) => setRateForm({ ...rateForm, batch_size: parseInt(e.target.value) || 50 })} disabled={isDemo} />
                    <p className="text-xs text-muted-foreground">Mensagens por lote antes da pausa</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Pausa entre Lotes (ms)</Label>
                    <Input type="number" min={5000} max={120000} value={rateForm.batch_pause_ms} onChange={(e) => setRateForm({ ...rateForm, batch_pause_ms: parseInt(e.target.value) || 30000 })} disabled={isDemo} />
                    <p className="text-xs text-muted-foreground">Padrão: 30000ms (30s)</p>
                  </div>
                </div>

                {/* Limits */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Limite Diário</Label>
                    <Input type="number" min={10} max={5000} value={rateForm.daily_limit} onChange={(e) => setRateForm({ ...rateForm, daily_limit: parseInt(e.target.value) || 500 })} disabled={isDemo} />
                    <p className="text-xs text-muted-foreground">Máximo de envios por dia</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Máx. por Minuto</Label>
                    <Input type="number" min={1} max={60} value={rateForm.max_per_minute} onChange={(e) => setRateForm({ ...rateForm, max_per_minute: parseInt(e.target.value) || 15 })} disabled={isDemo} />
                    <p className="text-xs text-muted-foreground">Limite de envios por minuto</p>
                  </div>
                </div>

                {/* Warm-up */}
                <div className="space-y-4 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-medium">Modo Warm-up</Label>
                      <p className="text-sm text-muted-foreground">Aumenta o limite diário gradualmente: 50 → 80 → 120 → 200 → 300 → limite configurado</p>
                    </div>
                    <Switch checked={rateForm.warmup_enabled} onCheckedChange={(v) => setRateForm({ ...rateForm, warmup_enabled: v })} disabled={isDemo} />
                  </div>
                  {rateForm.warmup_enabled && (
                    <div className="space-y-2">
                      <Label>Data de Início do Warm-up</Label>
                      <Input type="date" value={rateForm.warmup_start_date} onChange={(e) => setRateForm({ ...rateForm, warmup_start_date: e.target.value })} disabled={isDemo} />
                    </div>
                  )}
                </div>

                <Button 
                  onClick={async () => {
                    if (!empresaId) return;
                    await updateSendingConfig.mutateAsync({ ...rateForm, empresa_id: empresaId });
                    toast.success("Configurações de ritmo salvas!");
                  }} 
                  disabled={updateSendingConfig.isPending || isDemo}
                >
                  {updateSendingConfig.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar Controle de Ritmo
                </Button>
              </CardContent>
            </Card>

            {/* Card 4: Migração de Telefones */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-primary" />
                  <CardTitle>Migração de Telefones</CardTitle>
                </div>
                <CardDescription>
                  Analisa os telefones existentes e migra celulares para o campo WhatsApp. 
                  Números com 11 dígitos são migrados automaticamente. 
                  Números com 10 dígitos são validados via Z-API para verificar se possuem WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <p className="text-sm font-medium">Como funciona:</p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li><strong>11 dígitos (DDD+9):</strong> Movido para WhatsApp automaticamente</li>
                    <li><strong>10 dígitos (DDD+8):</strong> Validado via Z-API. Se não encontrado, tenta adicionar o 9 após o DDD</li>
                    <li><strong>Outros:</strong> Ignorados (mantidos em telefone)</li>
                  </ul>
                </div>
                <Button 
                  onClick={async () => {
                    if (!empresaId) {
                      toast.error("Empresa não encontrada");
                      return;
                    }
                    setIsMigrating(true);
                    try {
                      const { data, error } = await (await import("@/integrations/supabase/client")).supabase.functions.invoke("orbit-migrate-phones", {
                        body: { empresa_id: empresaId },
                      });
                      if (error) throw error;
                      const result = data?.data || data;
                      toast.success(
                        `Migração concluída! ${result.migrados_11 || 0} migrados (11 dígitos), ${result.validados_zapi || 0} validados via Z-API, ${result.invalidos || 0} inválidos, ${result.ignorados || 0} ignorados`
                      );
                    } catch (error: any) {
                      toast.error(error.message || "Erro na migração");
                    } finally {
                      setIsMigrating(false);
                    }
                  }}
                  disabled={isMigrating || isDemo}
                >
                  {isMigrating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Phone className="h-4 w-4 mr-2" />
                  )}
                  {isMigrating ? "Migrando..." : "Migrar Telefones Existentes"}
                </Button>
              </CardContent>
            </Card>
            </div>
        </TabsContent>
        <TabsContent value="email">
          {resendLoading ? <Loader2 className="animate-spin" /> : (
            <div className="space-y-6">
            {isDemo && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Modo Demo — Integrações externas desabilitadas. Disponível apenas em planos pagos.</span>
              </div>
            )}
              {/* Card 1: API Key Resend */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Lock className="h-5 w-5 text-primary" />
                    <CardTitle>API Key Resend</CardTitle>
                  </div>
                  <CardDescription>Configure sua API Key do Resend para envio de emails</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>API Key *</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input 
                          type={showApiKey ? "text" : "password"}
                          placeholder="re_xxxxxxxxxxxxxxxxxxxx" 
                          value={resendForm.api_key} 
                          onChange={(e) => setResendForm({ ...resendForm, api_key: e.target.value })}
                          disabled={isDemo}
                        />
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="icon" 
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                          onClick={() => setShowApiKey(!showApiKey)}
                        >
                          {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    {isApiKeyConfigured && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>API Key configurada: {getMaskedApiKey(resendConfig?.api_key || "")}</span>
                      </div>
                    )}
                    {!isApiKeyConfigured && (
                      <div className="flex items-center gap-2 text-sm text-amber-600">
                        <AlertCircle className="h-4 w-4" />
                        <span>API Key não configurada</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Email de Teste</Label>
                    <Input 
                      type="email"
                      placeholder="seu@email.com" 
                      value={resendForm.email_teste} 
                      onChange={(e) => setResendForm({ ...resendForm, email_teste: e.target.value })}
                      disabled={isDemo}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={saveResendApiKey} disabled={updateResend.isPending || isDemo}>
                      <Save className="h-4 w-4 mr-2" />Salvar API Key
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleTestConnection} 
                      disabled={testConnection.isPending || !isApiKeyConfigured || isDemo}
                    >
                      {testConnection.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Testar Conexão
                    </Button>
                  </div>

                  <div className="p-4 bg-muted rounded-lg space-y-3">
                    <p className="text-sm font-medium">Como obter a API Key:</p>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>
                        Acesse{" "}
                        <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          resend.com/api-keys
                        </a>
                      </li>
                      <li>Clique em "Create API Key"</li>
                      <li>Copie a chave e cole no campo acima</li>
                      <li>
                        Verifique seu domínio em{" "}
                        <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          resend.com/domains
                        </a>
                      </li>
                    </ol>
                  </div>
                </CardContent>
              </Card>

              {/* Card 2: Email Marketing (Campanhas) */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    <CardTitle>Email Marketing (Campanhas)</CardTitle>
                  </div>
                  <CardDescription>Configurações para envio de campanhas de email marketing</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Webhook URL</Label>
                    <div className="flex gap-2">
                      <Input value={emailWebhookUrl} readOnly className="font-mono text-sm" />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={() => { 
                          navigator.clipboard.writeText(emailWebhookUrl); 
                          toast.success("Copiado!"); 
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Configure este webhook no painel da Resend para receber eventos de email</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nome do Remetente</Label>
                      <Input 
                        placeholder="Orbit CRM" 
                        value={resendForm.from_name} 
                        onChange={(e) => setResendForm({ ...resendForm, from_name: e.target.value })}
                        disabled={isDemo}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email do Remetente *</Label>
                      <Input 
                        type="email"
                        placeholder="noreply@seudominio.com" 
                        value={resendForm.from_email} 
                        onChange={(e) => setResendForm({ ...resendForm, from_email: e.target.value })}
                        disabled={isDemo}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Domínio Verificado</Label>
                    <Input 
                      placeholder="seudominio.com" 
                      value={resendForm.dominio_verificado} 
                      onChange={(e) => setResendForm({ ...resendForm, dominio_verificado: e.target.value })}
                      disabled={isDemo}
                    />
                    <p className="text-xs text-muted-foreground">Certifique-se de que seu domínio está verificado na Resend</p>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="space-y-0.5">
                      <Label>Envio de emails ativo</Label>
                      <p className="text-xs text-muted-foreground">Habilita o envio de emails nas campanhas</p>
                    </div>
                    <Switch 
                      checked={resendForm.ativo} 
                      onCheckedChange={(v) => setResendForm({ ...resendForm, ativo: v })}
                      disabled={isDemo}
                    />
                  </div>

                  <Button onClick={saveResendCampaigns} disabled={updateResend.isPending || isDemo}>
                    <Save className="h-4 w-4 mr-2" />Salvar Configurações de Campanhas
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Tab Importar CSV */}
        <TabsContent value="import">
          <div className="space-y-6">
            {/* Card: Template */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-primary" />
                  <CardTitle>Modelo CSV</CardTitle>
                </div>
                <CardDescription>
                  Baixe o modelo para ver o formato correto dos campos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <p className="text-sm font-medium">Campos aceitos:</p>
                  <p className="text-sm text-muted-foreground">
                    nome_razao (obrigatório), nome_fantasia, tipo, cnpj_cpf, email, telefone, cidade, estado, segmento, origem, observacoes, tags
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                    <li>Use ponto e vírgula (;) ou vírgula (,) como separador</li>
                    <li>A primeira linha deve conter os nomes das colunas</li>
                    <li>Máximo de 1000 registros por importação</li>
                  </ul>
                </div>
                <Button onClick={handleDownloadTemplate} className="mt-4">
                  <Download className="h-4 w-4 mr-2" />
                  Baixar Template CSV
                </Button>
              </CardContent>
            </Card>

            {/* Card: Upload */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" />
                  <CardTitle>Upload do Arquivo</CardTitle>
                </div>
                <CardDescription>
                  Selecione um arquivo CSV com seus prospects
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedFile ? (
                  <div 
                    className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-sm font-medium">Clique para selecionar ou arraste um arquivo CSV</p>
                    <p className="text-xs text-muted-foreground mt-1">Máximo: 5MB, 1000 registros</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-primary" />
                        <div>
                          <p className="text-sm font-medium">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {parsedProspects.length} registro(s) encontrado(s)
                            {parseErrors.length > 0 && ` · ${parseErrors.length} erro(s)`}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={handleClearFile}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Preview Table */}
                    {parsedProspects.length > 0 && (
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nome</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Telefone</TableHead>
                              <TableHead>Cidade</TableHead>
                              <TableHead>Tipo</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {parsedProspects.slice(0, 5).map((p, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-medium">{p.nome_razao}</TableCell>
                                <TableCell>{p.email_principal || '-'}</TableCell>
                                <TableCell>{p.whatsapp || p.telefone || '-'}</TableCell>
                                <TableCell>{p.cidade || '-'}</TableCell>
                                <TableCell>{p.tipo || 'pessoa'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {parsedProspects.length > 5 && (
                          <p className="text-xs text-muted-foreground text-center py-2 bg-muted/50">
                            ... e mais {parsedProspects.length - 5} registro(s)
                          </p>
                        )}
                      </div>
                    )}

                    {/* Parse Errors */}
                    {parseErrors.length > 0 && (
                      <div className="p-3 bg-destructive/10 text-destructive rounded-lg">
                        <p className="text-sm font-medium mb-2">Erros encontrados:</p>
                        <ul className="text-xs space-y-1">
                          {parseErrors.slice(0, 5).map((err, idx) => (
                            <li key={idx}>Linha {err.row}: {err.message}</li>
                          ))}
                          {parseErrors.length > 5 && (
                            <li>... e mais {parseErrors.length - 5} erro(s)</li>
                          )}
                        </ul>
                      </div>
                    )}

                    {/* Import Options */}
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="ignoreDuplicates" 
                        checked={ignoreDuplicates}
                        onCheckedChange={(checked) => setIgnoreDuplicates(checked as boolean)}
                      />
                      <label htmlFor="ignoreDuplicates" className="text-sm">
                        Ignorar duplicados (por email ou telefone)
                      </label>
                    </div>

                    {/* Progress */}
                    {isImporting && (
                      <div className="space-y-2">
                        <Progress value={importProgress} />
                        <p className="text-xs text-center text-muted-foreground">
                          Importando... {importProgress}%
                        </p>
                      </div>
                    )}

                    {/* Import Button */}
                    <Button 
                      onClick={handleImport} 
                      disabled={isImporting || parsedProspects.length === 0}
                      className="w-full"
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Importando...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Importar {parsedProspects.length} Prospect(s)
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Card: Histórico */}
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Importações</CardTitle>
                <CardDescription>Últimas importações realizadas</CardDescription>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : importHistory && importHistory.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Arquivo</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Sucesso</TableHead>
                        <TableHead>Erros</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importHistory.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            {format(new Date(item.created_at!), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.arquivo_nome}</TableCell>
                          <TableCell>{item.total_registros}</TableCell>
                          <TableCell className="text-green-600">{item.sucesso}</TableCell>
                          <TableCell className="text-destructive">{item.erros}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma importação realizada
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="audios">
          <Card>
            <CardContent className="pt-6">
              <AudioLibraryManager />
            </CardContent>
          </Card>
        </TabsContent>
        {isOrgAdmin && (
          <TabsContent value="users">
            <ConfigUsersTab />
          </TabsContent>
        )}
      </Tabs>
    </OrbitLayout>
  );
}
