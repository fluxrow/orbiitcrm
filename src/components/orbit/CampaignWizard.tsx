import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ChevronLeft, ChevronRight, Mail, MessageSquare, Check, Calendar } from "lucide-react";
import { useOrbitTemplates, useCreateTemplate } from "@/hooks/useOrbitTemplates";
import { useOrbitProspects } from "@/hooks/useOrbitProspects";
import { useCreateCampaign } from "@/hooks/useOrbitCampaigns";
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
    tags?: string[];
  };
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
  const [newTemplate, setNewTemplate] = useState({ nome: "", categoria: "geral", assunto_email: "", corpo_texto: "" });
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const { data: templates } = useOrbitTemplates();
  const { data: prospects } = useOrbitProspects();
  const createCampaign = useCreateCampaign();
  const createTemplate = useCreateTemplate();

  const filteredTemplates = templates?.filter(t => t.canal === data.canal && t.ativo) || [];
  const selectedTemplate = templates?.find(t => t.id === data.template_id);

  // Calcular destinatários estimados
  const calculateRecipients = () => {
    if (!prospects) return 0;
    
    let filtered = prospects;
    
    if (data.filtros.status_qualificacao?.length) {
      filtered = filtered.filter(p => data.filtros.status_qualificacao?.includes(p.status_qualificacao || ""));
    }
    if (data.filtros.segmento) {
      filtered = filtered.filter(p => p.segmento === data.filtros.segmento);
    }
    if (data.filtros.cidade) {
      filtered = filtered.filter(p => p.cidade?.toLowerCase().includes(data.filtros.cidade?.toLowerCase() || ""));
    }
    
    // Filtrar por contato disponível
    if (data.canal === "email") {
      filtered = filtered.filter(p => p.email_principal && !p.optout_email);
    } else {
      filtered = filtered.filter(p => p.telefone_whatsapp && !p.optout_whatsapp);
    }
    
    return filtered.length;
  };

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
        empresa_id: profile.empresa_id,
        ativo: true,
      });

      setData({ ...data, template_id: created.id });
      setShowNewTemplate(false);
      setNewTemplate({ nome: "", categoria: "geral", assunto_email: "", corpo_texto: "" });
      toast.success("Template criado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar template");
    } finally {
      setIsSavingTemplate(false);
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

      // Criar campanha
      const campaign = await createCampaign.mutateAsync({
        nome: data.nome,
        canal: data.canal,
        publico_origem: data.publico_origem,
        template_id: data.template_id || null,
        filtros_json: data.filtros,
        agendada_para: data.agendada_para || null,
        status: data.agendada_para ? "agendada" : "rascunho",
        total_destinatarios: estimatedRecipients,
        empresa_id: profile.empresa_id,
        created_by: user.id,
      });

      // Criar recipients
      if (prospects && campaign) {
        let filteredProspects = prospects;
        
        if (data.filtros.status_qualificacao?.length) {
          filteredProspects = filteredProspects.filter(p => 
            data.filtros.status_qualificacao?.includes(p.status_qualificacao || "")
          );
        }
        if (data.filtros.segmento) {
          filteredProspects = filteredProspects.filter(p => p.segmento === data.filtros.segmento);
        }
        if (data.filtros.cidade) {
          filteredProspects = filteredProspects.filter(p => 
            p.cidade?.toLowerCase().includes(data.filtros.cidade?.toLowerCase() || "")
          );
        }
        
        if (data.canal === "email") {
          filteredProspects = filteredProspects.filter(p => p.email_principal && !p.optout_email);
        } else {
          filteredProspects = filteredProspects.filter(p => p.telefone_whatsapp && !p.optout_whatsapp);
        }

        const recipients = filteredProspects.map(p => ({
          campaign_id: campaign.id,
          empresa_id: profile.empresa_id,
          prospect_id: p.id,
          email: p.email_principal,
          telefone: p.telefone_whatsapp,
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
    });
    setEstimatedRecipients(0);
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
      <DialogContent className="max-w-2xl">
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
                    <Button variant="outline" size="sm" onClick={() => setShowNewTemplate(true)}>
                      + Criar novo
                    </Button>
                  </div>
              
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
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium">{template.nome}</p>
                                {template.assunto_email && (
                                  <p className="text-sm text-muted-foreground">Assunto: {template.assunto_email}</p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  {template.corpo_texto?.substring(0, 100)}...
                                </p>
                              </div>
                              <Badge variant="outline">{template.categoria}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 3: Filtros */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Filtre os destinatários (deixe em branco para enviar a todos):
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Status de Qualificação</Label>
                  <div className="flex flex-wrap gap-2">
                    {["novo", "em_qualificacao", "qualificado"].map((status) => (
                      <label key={status} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox 
                          checked={data.filtros.status_qualificacao?.includes(status)}
                          onCheckedChange={(checked) => {
                            const current = data.filtros.status_qualificacao || [];
                            setData({
                              ...data,
                              filtros: {
                                ...data.filtros,
                                status_qualificacao: checked 
                                  ? [...current, status]
                                  : current.filter(s => s !== status)
                              }
                            });
                          }}
                        />
                        <span className="text-sm capitalize">{status.replace("_", " ")}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Segmento</Label>
                  <Input 
                    placeholder="Ex: Tecnologia"
                    value={data.filtros.segmento || ""}
                    onChange={(e) => setData({ 
                      ...data, 
                      filtros: { ...data.filtros, segmento: e.target.value } 
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input 
                    placeholder="Ex: São Paulo"
                    value={data.filtros.cidade || ""}
                    onChange={(e) => setData({ 
                      ...data, 
                      filtros: { ...data.filtros, cidade: e.target.value } 
                    })}
                  />
                </div>
              </div>
            </div>
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
