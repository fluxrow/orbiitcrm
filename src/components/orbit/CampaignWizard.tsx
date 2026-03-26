import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Loader2, ChevronLeft, ChevronRight, Mail, MessageSquare, Check, Calendar, Sparkles, Send, Eye, Upload, X, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { handleApiResponse } from "@/lib/api-envelope";
import { useOrbitTemplates, useCreateTemplate } from "@/hooks/useOrbitTemplates";
import { useOrbitProspects } from "@/hooks/useOrbitProspects";
import { useCreateCampaign } from "@/hooks/useOrbitCampaigns";
import { useOrbitSendGroups, useCreateSendGroup, useDeleteSendGroup } from "@/hooks/useOrbitSendGroups";
import { RecipientSelector } from "./RecipientSelector";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CampaignWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CampaignData {
  nome: string;
  canal: "email" | "whatsapp";
  publico_origem: "prospects" | "prometheus" | "ambos";
  template_id: string;
  filtros: {
    status_qualificacao?: string[];
    segmento?: string;
    cidade?: string;
    estado?: string;
    origem_contato?: string;
    origem_lead?: string;
    tags?: string[];
    score_min?: number;
    responsavel_id?: string;
    apenas_consentimento?: boolean;
    excluir_campanha_id?: string;
    apenas_abriu_campanha_id?: string;
    nao_abriu_campanha_id?: string;
  };
  selected_prospect_ids?: string[];
  selected_group_ids?: string[];
  agendada_para?: string;
}

const steps = [
  { id: 1, title: "Informações Básicas", description: "Nome e canal da campanha" },
  { id: 2, title: "Template", description: "Selecione o template de mensagem" },
  { id: 3, title: "Destinatários", description: "Filtros de público" },
  { id: 4, title: "Agendamento", description: "Quando enviar" },
  { id: 5, title: "Revisão", description: "Confirme os dados" },
];

export function CampaignWizard({ open, onOpenChange }: CampaignWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<CampaignData>({
    nome: "",
    canal: "email",
    publico_origem: "prospects",
    template_id: "",
    filtros: {},
  });
  const [isCreating, setIsCreating] = useState(false);
  const [estimatedRecipients, setEstimatedRecipients] = useState(0);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ nome: "", categoria: "geral", assunto_email: "", corpo_texto: "", imagem_url: "" });
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [showAiGen, setShowAiGen] = useState(false);
  const [aiObjetivo, setAiObjetivo] = useState("");
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [showTestEmail, setShowTestEmail] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testVars, setTestVars] = useState<Record<string, string>>({});
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [individualSearch, setIndividualSearch] = useState("");

  const { data: templates } = useOrbitTemplates();
  const { data: prospects } = useOrbitProspects();
  const createCampaign = useCreateCampaign();
  const createTemplate = useCreateTemplate();
  const { data: sendGroups } = useOrbitSendGroups();

  // Fetch profiles for responsavel filter
  const { data: companyProfiles } = useQuery({
    queryKey: ["company-profiles-for-filter"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome, email").eq("ativo", true);
      if (error) throw error;
      return data;
    },
  });

  // Derived distinct values from prospects
  const distinctValues = useMemo(() => {
    if (!prospects) return { segmentos: [], estados: [], origens_contato: [], origens_lead: [], tags: [] };
    const segmentos = [...new Set(prospects.map(p => p.segmento).filter(Boolean))] as string[];
    const estados = [...new Set(prospects.map(p => p.estado).filter(Boolean))] as string[];
    const origens_contato = [...new Set(prospects.map(p => p.origem_contato).filter(Boolean))] as string[];
    const origens_lead = [...new Set(prospects.map(p => p.origem_lead).filter(Boolean))] as string[];
    const allTags = prospects.flatMap(p => (p.tags as string[]) || []);
    const tags = [...new Set(allTags.filter(Boolean))] as string[];
    return { segmentos, estados, origens_contato, origens_lead, tags };
  }, [prospects]);

  const filteredTemplates = templates?.filter(t => t.canal === data.canal && t.ativo) || [];
  const selectedTemplate = templates?.find(t => t.id === data.template_id);

  // Apply all filters to prospects
  const applyFilters = (list: typeof prospects) => {
    if (!list) return [];
    let filtered = [...list];

    const f = data.filtros;
    if (f.status_qualificacao?.length) {
      filtered = filtered.filter(p => f.status_qualificacao?.includes(p.status_qualificacao || ""));
    }
    if (f.segmento) {
      filtered = filtered.filter(p => p.segmento === f.segmento);
    }
    if (f.cidade) {
      filtered = filtered.filter(p => p.cidade?.toLowerCase().includes(f.cidade?.toLowerCase() || ""));
    }
    if (f.estado) {
      filtered = filtered.filter(p => p.estado === f.estado);
    }
    if (f.origem_contato) {
      filtered = filtered.filter(p => p.origem_contato === f.origem_contato);
    }
    if (f.origem_lead) {
      filtered = filtered.filter(p => p.origem_lead === f.origem_lead);
    }
    if (f.tags?.length) {
      filtered = filtered.filter(p => {
        const pTags = (p.tags as string[]) || [];
        return f.tags!.some(t => pTags.includes(t));
      });
    }
    if (f.score_min !== undefined && f.score_min > 0) {
      filtered = filtered.filter(p => (p.score || 0) >= f.score_min!);
    }
    if (f.responsavel_id) {
      filtered = filtered.filter(p => p.responsavel_id === f.responsavel_id);
    }
    if (f.apenas_consentimento) {
      if (data.canal === "email") {
        filtered = filtered.filter(p => p.consentimento_email);
      } else {
        filtered = filtered.filter(p => p.consentimento_whatsapp);
      }
    }

    // Filtrar por contato disponível
    if (data.canal === "email") {
      filtered = filtered.filter(p => p.email_principal && !p.optout_email);
    } else {
      filtered = filtered.filter(p => (p.whatsapp || p.telefone) && !p.optout_whatsapp);
    }

    return filtered;
  };

  // Combine all sources and deduplicate
  const calculateAllRecipientIds = (): string[] => {
    const ids = new Set<string>();

    // 1. From filters — only if at least one filter is active
    const f = data.filtros;
    const hasAnyFilter = !!(
      f.status_qualificacao?.length ||
      f.segmento ||
      f.cidade ||
      f.estado ||
      f.origem_contato ||
      f.origem_lead ||
      f.tags?.length ||
      (f.score_min !== undefined && f.score_min > 0) ||
      f.responsavel_id ||
      f.apenas_consentimento ||
      f.excluir_campanha_id ||
      f.apenas_abriu_campanha_id ||
      f.nao_abriu_campanha_id
    );

    if (hasAnyFilter) {
      const fromFilters = applyFilters(prospects);
      fromFilters.forEach(p => ids.add(p.id));
    }

    // 2. Individual selection
    data.selected_prospect_ids?.forEach(id => ids.add(id));

    // 3. From groups
    if (data.selected_group_ids?.length && sendGroups) {
      sendGroups
        .filter(g => data.selected_group_ids!.includes(g.id))
        .forEach(g => (g.prospect_ids || []).forEach(id => ids.add(id)));
    }

    // Filter the combined set to only include prospects with valid contact info
    if (!prospects) return [...ids];
    return [...ids].filter(id => {
      const p = prospects.find(pr => pr.id === id);
      if (!p) return false;
      if (data.canal === "email") return p.email_principal && !p.optout_email;
      return (p.whatsapp || p.telefone) && !p.optout_whatsapp;
    });
  };

  const calculateRecipients = () => calculateAllRecipientIds().length;

  const handleNext = () => {
    if (currentStep === 3) {
      setEstimatedRecipients(calculateRecipients());
    }
    if (currentStep === 2) {
      setShowNewTemplate(false);
    }
    setCurrentStep(prev => Math.min(prev + 1, 5));
  };

  const handleSaveTemplate = async () => {
    try {
      setIsSavingTemplate(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      const { data: profile } = await supabase.from("profiles").select("empresa_id").eq("id", user.id).single();
      if (!profile?.empresa_id) throw new Error("Empresa não encontrada");

      const created = await createTemplate.mutateAsync({
        nome: newTemplate.nome,
        canal: data.canal,
        categoria: newTemplate.categoria,
        assunto_email: data.canal === "email" ? newTemplate.assunto_email : null,
        corpo_texto: newTemplate.corpo_texto,
        imagem_url: newTemplate.imagem_url || null,
        empresa_id: profile.empresa_id,
        ativo: true,
      });

      setData({ ...data, template_id: created.id });
      setShowNewTemplate(false);
      setNewTemplate({ nome: "", categoria: "geral", assunto_email: "", corpo_texto: "", imagem_url: "" });
      toast.success("Template criado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar template");
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleGenerateAiTemplate = async () => {
    if (!aiObjetivo.trim()) { toast.error("Descreva o objetivo do template"); return; }
    try {
      setIsGeneratingAi(true);
      const { data: result, error } = await supabase.functions.invoke("orbit-ai-generate-template", {
        body: { canal: data.canal, categoria: newTemplate.categoria, objetivo: aiObjetivo },
      });
      if (error) {
        throw new Error(result?.error?.message || error.message || "Erro na geração");
      }
      if (!result?.ok) throw new Error(result?.error?.message || "Erro na geração");
      setNewTemplate({
        nome: result.data.nome || "",
        categoria: result.data.categoria || newTemplate.categoria,
        assunto_email: result.data.assunto_email || "",
        corpo_texto: result.data.corpo_texto || "",
        imagem_url: "",
      });
      setShowAiGen(false);
      setShowNewTemplate(true);
      toast.success("Template gerado! Revise e salve.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar template com IA");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const defaultVarValues: Record<string, string> = {
    nome: "João Teste", empresa: "Empresa Exemplo", cidade: "São Paulo",
    link: "https://exemplo.com", responsavel: "Maria Responsável", segmento: "Tecnologia",
  };

  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\{(\w+)\}/g);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.replace(/[{}]/g, "")))];
  };

  const substituteVars = (text: string, vars: Record<string, string>) => {
    return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `{${key}}`);
  };

  const handleOpenTestEmail = () => {
    if (!selectedTemplate) return;
    const vars = extractVariables(selectedTemplate.corpo_texto || "");
    const initial: Record<string, string> = {};
    vars.forEach(v => { initial[v] = defaultVarValues[v] || ""; });
    setTestVars(initial);
    setShowTestEmail(true);
  };

  const handleSendTestEmail = async () => {
    if (!testEmail.trim()) { toast.error("Informe o email de destino"); return; }
    if (!selectedTemplate) return;
    try {
      setIsSendingTest(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      const { data: profile } = await supabase.from("profiles").select("empresa_id").eq("id", user.id).single();
      
      const bodyText = substituteVars(selectedTemplate.corpo_texto || "", testVars);
      const subject = substituteVars(selectedTemplate.assunto_email || "Teste", testVars);
      const templateImg = (selectedTemplate as any).imagem_url || "";
      let html = "";
      if (templateImg) {
        html += `<div style="margin-bottom:16px"><img src="${templateImg}" alt="Campanha" style="max-width:100%;height:auto;border-radius:8px" /></div>`;
      }
      html += bodyText.replace(/\n/g, "<br>");

      const res = await supabase.functions.invoke("orbit-send-email", {
        body: { to: testEmail, subject, html, empresa_id: profile?.empresa_id, sender_user_id: user?.id },
      });
      handleApiResponse(res);
      toast.success("Email de teste enviado!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar email de teste");
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      setIsUploadingImage(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("campaign-images").upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("campaign-images").getPublicUrl(path);
      setNewTemplate(prev => ({ ...prev, imagem_url: urlData.publicUrl }));
      toast.success("Imagem enviada!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar imagem");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleCreate = async () => {
    try {
      setIsCreating(true);

      // Buscar empresa_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("empresa_id")
        .eq("id", user.id)
        .single();

      if (!profile?.empresa_id) throw new Error("Empresa não encontrada");

      // Calculate recipients BEFORE creating campaign to get accurate count
      const recipientIds = calculateAllRecipientIds();
      const recipientProspects = prospects?.filter(p => recipientIds.includes(p.id)) || [];

      // Criar campanha with accurate total
      const campaign = await createCampaign.mutateAsync({
        nome: data.nome,
        canal: data.canal,
        publico_origem: data.publico_origem,
        template_id: data.template_id || null,
        filtros_json: data.filtros,
        agendada_para: data.agendada_para || null,
        status: data.agendada_para ? "agendada" : "rascunho",
        total_destinatarios: recipientIds.length,
        empresa_id: profile.empresa_id,
        created_by: user.id,
      });

      // Criar recipients
      if (campaign) {

        const recipients = recipientProspects.map(p => ({
          campaign_id: campaign.id,
          empresa_id: profile.empresa_id,
          prospect_id: p.id,
          email: p.email_principal,
          telefone: p.whatsapp || p.telefone,
          status: "pendente",
        }));

        if (recipients.length > 0) {
          await supabase.from("orbit_campaign_recipients").insert(recipients);
        }
      }

      toast.success("Campanha criada com sucesso!");
      onOpenChange(false);
      resetForm();

    } catch (error: any) {
      toast.error(error.message || "Erro ao criar campanha");
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setCurrentStep(1);
    setData({
      nome: "",
      canal: "email",
      publico_origem: "prospects",
      template_id: "",
      filtros: {},
      selected_prospect_ids: [],
      selected_group_ids: [],
    });
    setEstimatedRecipients(0);
    setIndividualSearch("");
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return data.nome.trim().length > 0;
      case 2:
        return data.template_id.length > 0;
      default:
        return true;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Nova Campanha</DialogTitle>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex justify-between mb-6">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                currentStep > step.id 
                  ? "bg-primary text-primary-foreground" 
                  : currentStep === step.id 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted text-muted-foreground"
              }`}>
                {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id}
              </div>
              {index < steps.length - 1 && (
                <div className={`w-12 h-0.5 mx-1 ${
                  currentStep > step.id ? "bg-primary" : "bg-muted"
                }`} />
              )}
            </div>
          ))}
        </div>

        <div className="min-h-[300px]">
          {/* Step 1: Informações Básicas */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da Campanha *</Label>
                <Input 
                  placeholder="Ex: Black Friday 2024"
                  value={data.nome}
                  onChange={(e) => setData({ ...data, nome: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Canal</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Card 
                    className={`cursor-pointer transition-all ${data.canal === "email" ? "border-primary ring-2 ring-primary" : ""}`}
                    onClick={() => setData({ ...data, canal: "email", template_id: "" })}
                  >
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="p-2 rounded-lg bg-blue-500/20">
                        <Mail className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-medium">Email</p>
                        <p className="text-xs text-muted-foreground">Via Resend</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card 
                    className={`cursor-pointer transition-all ${data.canal === "whatsapp" ? "border-primary ring-2 ring-primary" : ""}`}
                    onClick={() => setData({ ...data, canal: "whatsapp", template_id: "" })}
                  >
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className="p-2 rounded-lg bg-green-500/20">
                        <MessageSquare className="h-5 w-5 text-green-500" />
                      </div>
                      <div>
                        <p className="font-medium">WhatsApp</p>
                        <p className="text-xs text-muted-foreground">Via Z-API</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Origem do Público</Label>
                <Select 
                  value={data.publico_origem} 
                  onValueChange={(v: "prospects" | "prometheus" | "ambos") => setData({ ...data, publico_origem: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prospects">Apenas Prospects</SelectItem>
                    <SelectItem value="prometheus">Apenas Prometheus</SelectItem>
                    <SelectItem value="ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 2: Template */}
          {currentStep === 2 && (
            <div className="space-y-4">
              {showNewTemplate ? (
                <div className="space-y-4">
                  <p className="text-sm font-medium">Criar novo template de {data.canal === "email" ? "email" : "WhatsApp"}:</p>
                  <div className="space-y-2">
                    <Label>Nome do Template *</Label>
                    <Input placeholder="Ex: Boas-vindas" value={newTemplate.nome} onChange={(e) => setNewTemplate({ ...newTemplate, nome: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select value={newTemplate.categoria} onValueChange={(v) => setNewTemplate({ ...newTemplate, categoria: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="geral">Geral</SelectItem>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="vendas">Vendas</SelectItem>
                        <SelectItem value="suporte">Suporte</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {data.canal === "email" && (
                    <div className="space-y-2">
                      <Label>Assunto do Email</Label>
                      <Input placeholder="Ex: Oferta especial para você" value={newTemplate.assunto_email} onChange={(e) => setNewTemplate({ ...newTemplate, assunto_email: e.target.value })} />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Imagem (opcional)</Label>
                    {newTemplate.imagem_url ? (
                      <div className="relative inline-block">
                        <img src={newTemplate.imagem_url} alt="Preview" className="w-full max-h-40 object-cover rounded border" />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 h-6 w-6"
                          onClick={() => setNewTemplate({ ...newTemplate, imagem_url: "" })}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div
                          className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const file = e.dataTransfer.files?.[0];
                            if (file && file.type.startsWith("image/")) {
                              await handleImageUpload(file);
                            } else {
                              toast.error("Selecione um arquivo de imagem");
                            }
                          }}
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "image/*";
                            input.onchange = async (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) await handleImageUpload(file);
                            };
                            input.click();
                          }}
                        >
                          {isUploadingImage ? (
                            <div className="flex items-center justify-center gap-2 text-muted-foreground">
                              <Loader2 className="h-5 w-5 animate-spin" />
                              <span className="text-sm">Enviando...</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-muted-foreground">
                              <Upload className="h-6 w-6" />
                              <span className="text-sm">Clique ou arraste uma imagem</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">ou cole a URL:</span>
                          <Input
                            placeholder="https://exemplo.com/imagem.jpg"
                            className="h-8 text-xs"
                            onBlur={(e) => {
                              if (e.target.value.trim()) {
                                setNewTemplate({ ...newTemplate, imagem_url: e.target.value.trim() });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const val = (e.target as HTMLInputElement).value.trim();
                                if (val) setNewTemplate({ ...newTemplate, imagem_url: val });
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Corpo do Texto *</Label>
                    <Textarea placeholder="Escreva o conteúdo do template..." rows={5} value={newTemplate.corpo_texto} onChange={(e) => setNewTemplate({ ...newTemplate, corpo_texto: e.target.value })} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setShowNewTemplate(false)}>Cancelar</Button>
                    <Button onClick={handleSaveTemplate} disabled={isSavingTemplate || !newTemplate.nome.trim() || !newTemplate.corpo_texto.trim()}>
                      {isSavingTemplate ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : "Salvar Template"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Selecione um template de {data.canal === "email" ? "email" : "WhatsApp"}:
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setAiObjetivo(""); setShowAiGen(true); }}>
                        <Sparkles className="h-4 w-4 mr-1" />Gerar IA
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowNewTemplate(true)}>
                        + Criar novo
                      </Button>
                    </div>
                  </div>

                  {showAiGen && (
                    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                      <Label>Descreva o objetivo do template</Label>
                      <Textarea
                        placeholder="Ex: Follow-up após reunião de apresentação"
                        value={aiObjetivo}
                        onChange={(e) => setAiObjetivo(e.target.value)}
                        rows={2}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setShowAiGen(false)}>Cancelar</Button>
                        <Button size="sm" onClick={handleGenerateAiTemplate} disabled={isGeneratingAi}>
                          {isGeneratingAi ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                          {isGeneratingAi ? "Gerando..." : "Gerar"}
                        </Button>
                      </div>
                    </div>
                  )}
              
                  {filteredTemplates.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Nenhum template de {data.canal} encontrado.</p>
                      <p className="text-sm">Clique em "Criar novo" acima para criar um template.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {filteredTemplates.map((template) => (
                        <Card 
                          key={template.id}
                          className={`cursor-pointer transition-all ${data.template_id === template.id ? "border-primary ring-2 ring-primary" : ""}`}
                          onClick={() => setData({ ...data, template_id: template.id })}
                        >
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start gap-3">
                              <div className="flex gap-3 flex-1 min-w-0">
                                {(template as any).imagem_url && (
                                  <img src={(template as any).imagem_url} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0 border" />
                                )}
                                <div className="min-w-0">
                                  <p className="font-medium">{template.nome}</p>
                                  {template.assunto_email && (
                                    <p className="text-sm text-muted-foreground">Assunto: {template.assunto_email}</p>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-1 truncate whitespace-pre-wrap">
                                    {template.corpo_texto?.substring(0, 100)}...
                                  </p>
                                </div>
                              </div>
                              <Badge variant="outline" className="flex-shrink-0">{template.categoria}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Botão Enviar Email de Teste */}
                  {data.template_id && data.canal === "email" && (
                    <div className="pt-2">
                      {!showTestEmail ? (
                        <Button variant="outline" size="sm" onClick={handleOpenTestEmail}>
                          <Mail className="h-4 w-4 mr-1" /> Enviar Email de Teste
                        </Button>
                      ) : (
                        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Enviar Email de Teste</p>
                            <Button variant="ghost" size="sm" onClick={() => setShowTestEmail(false)}>✕</Button>
                          </div>
                          <div className="space-y-2">
                            <Label>Email de Destino *</Label>
                            <Input type="email" placeholder="teste@exemplo.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
                          </div>
                          <Tabs defaultValue="dados">
                            <TabsList className="w-full">
                              <TabsTrigger value="dados" className="flex-1">Dados de Teste</TabsTrigger>
                              <TabsTrigger value="preview" className="flex-1"><Eye className="h-3 w-3 mr-1" />Preview</TabsTrigger>
                            </TabsList>
                            <TabsContent value="dados">
                              {Object.keys(testVars).length > 0 ? (
                                <div className="grid grid-cols-2 gap-3">
                                  {Object.entries(testVars).map(([key, val]) => (
                                    <div key={key} className="space-y-1">
                                      <Label className="text-xs">{`{${key}}`}</Label>
                                      <Input value={val} onChange={(e) => setTestVars({ ...testVars, [key]: e.target.value })} />
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground py-2">Nenhuma variável encontrada no template.</p>
                              )}
                            </TabsContent>
                            <TabsContent value="preview">
                              <div className="space-y-2">
                                {selectedTemplate?.assunto_email && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground">Assunto:</p>
                                    <p className="text-sm font-medium">{substituteVars(selectedTemplate.assunto_email, testVars)}</p>
                                  </div>
                                )}
                                {(selectedTemplate as any)?.imagem_url && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground">Imagem:</p>
                                    <img src={(selectedTemplate as any).imagem_url} alt="Template" className="w-full max-h-40 object-cover rounded border" />
                                  </div>
                                )}
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground">Corpo:</p>
                                  <div className="bg-background border rounded p-3 text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                                    {substituteVars(selectedTemplate?.corpo_texto || "", testVars)}
                                  </div>
                                </div>
                              </div>
                            </TabsContent>
                          </Tabs>
                          <div className="flex justify-end">
                            <Button size="sm" onClick={handleSendTestEmail} disabled={isSendingTest || !testEmail.trim()}>
                              {isSendingTest ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                              {isSendingTest ? "Enviando..." : "Enviar Teste"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 3: Destinatários */}
          {currentStep === 3 && (
            <RecipientSelector
              canal={data.canal}
              filtros={data.filtros}
              onFiltrosChange={(f) => setData({ ...data, filtros: f })}
              selectedProspectIds={data.selected_prospect_ids || []}
              onSelectedProspectIdsChange={(ids) => setData({ ...data, selected_prospect_ids: ids })}
              selectedGroupIds={data.selected_group_ids || []}
              onSelectedGroupIdsChange={(ids) => setData({ ...data, selected_group_ids: ids })}
              totalRecipients={calculateRecipients()}
            />
          )}

          {/* Step 4: Agendamento */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Escolha quando a campanha deve ser enviada:
              </p>

              <div className="grid grid-cols-2 gap-4">
                <Card 
                  className={`cursor-pointer transition-all ${!data.agendada_para ? "border-primary ring-2 ring-primary" : ""}`}
                  onClick={() => setData({ ...data, agendada_para: undefined })}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="p-2 rounded-lg bg-green-500/20">
                      <Check className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="font-medium">Enviar Agora</p>
                      <p className="text-xs text-muted-foreground">Salvar e solicitar aprovação</p>
                    </div>
                  </CardContent>
                </Card>
                <Card 
                  className={`cursor-pointer transition-all ${data.agendada_para ? "border-primary ring-2 ring-primary" : ""}`}
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(9, 0, 0, 0);
                    setData({ ...data, agendada_para: tomorrow.toISOString() });
                  }}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="p-2 rounded-lg bg-blue-500/20">
                      <Calendar className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-medium">Agendar</p>
                      <p className="text-xs text-muted-foreground">Definir data e hora</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {data.agendada_para && (
                <div className="space-y-2">
                  <Label>Data e Hora do Envio</Label>
                  <Input 
                    type="datetime-local"
                    value={data.agendada_para ? new Date(data.agendada_para).toISOString().slice(0, 16) : ""}
                    onChange={(e) => setData({ ...data, agendada_para: new Date(e.target.value).toISOString() })}
                  />
                </div>
              )}
            </div>
          )}

          {/* Step 5: Revisão */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nome:</span>
                  <span className="font-medium">{data.nome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Canal:</span>
                  <Badge>{data.canal === "email" ? "📧 Email" : "📱 WhatsApp"}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Template:</span>
                  <span className="font-medium">{selectedTemplate?.nome || "N/A"}</span>
                </div>
                {(selectedTemplate as any)?.imagem_url && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground text-sm">Imagem:</span>
                    <img src={(selectedTemplate as any).imagem_url} alt="Campanha" className="w-full max-h-32 object-cover rounded border" />
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Destinatários:</span>
                  <span className="font-medium">{estimatedRecipients}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Agendamento:</span>
                  <span className="font-medium">
                    {data.agendada_para 
                      ? new Date(data.agendada_para).toLocaleString("pt-BR")
                      : "Imediato (após aprovação)"
                    }
                  </span>
                </div>
              </div>

              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-sm text-amber-600">
                  ⚠️ A campanha será criada em modo rascunho. Você precisará solicitar aprovação antes de enviar.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={handleBack} disabled={currentStep === 1}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          {currentStep < 5 ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Próximo
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar Campanha"
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
