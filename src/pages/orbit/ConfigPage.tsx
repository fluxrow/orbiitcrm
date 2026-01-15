import { useState, useEffect, useRef } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
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
import { Bot, MessageSquare, Mail, Save, Loader2, Copy, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Send, Upload, Download, FileText, X } from "lucide-react";
import { useOrbitAIConfig, useUpdateAIConfig, useOrbitZAPIConfig, useUpdateZAPIConfig, useOrbitResendConfig, useUpdateResendConfig, useTestResendConnection } from "@/hooks/useOrbitConfig";
import { parseCSV, generateCSVTemplate, useImportProspects, useImportHistory } from "@/hooks/useImportProspects";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ParsedProspect {
  nome_razao: string;
  nome_fantasia?: string;
  tipo?: string;
  cnpj_cpf?: string;
  email_principal?: string;
  telefone_whatsapp?: string;
  cidade?: string;
  estado?: string;
  segmento?: string;
  origem_lead?: string;
  observacoes?: string;
  tags?: string[];
}

export default function ConfigPage() {
  const { data: aiConfig, isLoading: aiLoading } = useOrbitAIConfig();
  const { data: zapiConfig, isLoading: zapiLoading } = useOrbitZAPIConfig();
  const { data: resendConfig, isLoading: resendLoading } = useOrbitResendConfig();
  const { data: importHistory, isLoading: historyLoading } = useImportHistory();
  const updateAI = useUpdateAIConfig();
  const updateZAPI = useUpdateZAPIConfig();
  const updateResend = useUpdateResendConfig();
  const testConnection = useTestResendConnection();
  const importProspects = useImportProspects();

  const [aiForm, setAiForm] = useState({ modo_automatico: true, tom_conversa: "", prompt_treinamento: "", horario_inicio: "08:00", horario_fim: "18:00" });
  const [zapiForm, setZapiForm] = useState({ instance_id: "", token: "", client_token: "", ativo: false });
  const [resendForm, setResendForm] = useState({ 
    api_key: "", 
    email_teste: "", 
    from_email: "", 
    from_name: "Orbit CRM", 
    dominio_verificado: "",
    ativo: false 
  });
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Import states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedProspects, setParsedProspects] = useState<ParsedProspect[]>([]);
  const [parseErrors, setParseErrors] = useState<{ row: number; field: string; message: string }[]>([]);
  const [ignoreDuplicates, setIgnoreDuplicates] = useState(true);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orbit-webhook`;
  const emailWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orbit-send-email`;

  useEffect(() => { if (aiConfig) setAiForm({ modo_automatico: aiConfig.modo_automatico ?? true, tom_conversa: aiConfig.tom_conversa || "", prompt_treinamento: aiConfig.prompt_treinamento || "", horario_inicio: aiConfig.horario_inicio || "08:00", horario_fim: aiConfig.horario_fim || "18:00" }); }, [aiConfig]);
  useEffect(() => { if (zapiConfig) setZapiForm({ instance_id: zapiConfig.instance_id || "", token: zapiConfig.token || "", client_token: zapiConfig.client_token || "", ativo: zapiConfig.ativo ?? false }); }, [zapiConfig]);
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

  const saveAI = async () => { await updateAI.mutateAsync({ id: aiConfig?.id, ...aiForm }); toast.success("Salvo!"); };
  const saveZAPI = async () => { await updateZAPI.mutateAsync({ id: zapiConfig?.id, ...zapiForm }); toast.success("Salvo!"); };
  
  const saveResendApiKey = async () => { 
    await updateResend.mutateAsync({ 
      id: resendConfig?.id, 
      api_key: resendForm.api_key,
      email_teste: resendForm.email_teste 
    }); 
    toast.success("API Key salva!"); 
  };

  const saveResendCampaigns = async () => { 
    await updateResend.mutateAsync({ 
      id: resendConfig?.id, 
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
            <div className="space-y-6">
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
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={saveResendApiKey} disabled={updateResend.isPending}>
                      <Save className="h-4 w-4 mr-2" />Salvar API Key
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleTestConnection} 
                      disabled={testConnection.isPending || !isApiKeyConfigured}
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
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email do Remetente *</Label>
                      <Input 
                        type="email"
                        placeholder="noreply@seudominio.com" 
                        value={resendForm.from_email} 
                        onChange={(e) => setResendForm({ ...resendForm, from_email: e.target.value })} 
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Domínio Verificado</Label>
                    <Input 
                      placeholder="seudominio.com" 
                      value={resendForm.dominio_verificado} 
                      onChange={(e) => setResendForm({ ...resendForm, dominio_verificado: e.target.value })} 
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
                    />
                  </div>

                  <Button onClick={saveResendCampaigns} disabled={updateResend.isPending}>
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
                                <TableCell>{p.telefone_whatsapp || '-'}</TableCell>
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
      </Tabs>
    </OrbitLayout>
  );
}