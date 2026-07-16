import { useState, useEffect, useCallback } from "react";
import DOMPurify from "isomorphic-dompurify";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { EmailTemplateEditor } from "@/components/orbit/EmailTemplateEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Loader2, ImagePlus, Link, X, Eye, EyeOff, Info, MessageCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrbitTemplates, useCreateTemplate, useUpdateTemplate } from "@/hooks/useOrbitTemplates";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

const CATEGORIAS = [
  { value: "geral", label: "Geral" },
  { value: "marketing", label: "Marketing" },
  { value: "vendas", label: "Vendas" },
  { value: "suporte", label: "Suporte" },
];

const ALLOWED_VARS = ["{{nome}}", "{{empresa}}", "{{nome_fantasia}}", "{{email}}", "{{telefone}}", "{{cidade}}", "{{segmento}}"];

interface TemplateForm {
  nome: string;
  categoria: string;
  assunto_email: string;
  corpo_texto: string;
  imagem_url: string;
  whatsapp_cta_enabled: boolean;
  whatsapp_cta_numero: string;
  whatsapp_cta_texto_botao: string;
  whatsapp_cta_mensagem_inicial: string;
  whatsapp_cta_posicao: "topo" | "rodape";
}

const emptyForm: TemplateForm = {
  nome: "", categoria: "geral", assunto_email: "", corpo_texto: "", imagem_url: "",
  whatsapp_cta_enabled: false,
  whatsapp_cta_numero: "",
  whatsapp_cta_texto_botao: "Falar no WhatsApp",
  whatsapp_cta_mensagem_inicial: "Olá! Vim pelo email da {{empresa}}.",
  whatsapp_cta_posicao: "rodape",
};

export default function EmailTemplateEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditing = !!id;
  const { empresaId: tenantEmpresaId } = useTenant();

  const { data: templates } = useOrbitTemplates({ canal: "email" });
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();

  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [originalForm, setOriginalForm] = useState<TemplateForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageMode, setImageMode] = useState<"upload" | "url">("upload");
  const [showPreview, setShowPreview] = useState(true);
  const [loaded, setLoaded] = useState(!isEditing);

  // Load from AI generate (via navigate state)
  useEffect(() => {
    const state = location.state as TemplateForm | null;
    if (state && state.nome) {
      setForm(state);
      setOriginalForm(state);
      setLoaded(true);
      // Clear the state
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Load existing template
  useEffect(() => {
    if (isEditing && templates) {
      const t = templates.find((tpl) => tpl.id === id);
      if (t) {
        const loaded: TemplateForm = {
          nome: t.nome,
          categoria: t.categoria || "geral",
          assunto_email: t.assunto_email || "",
          corpo_texto: t.corpo_texto || "",
          imagem_url: (t as any).imagem_url || "",
          whatsapp_cta_enabled: (t as any).whatsapp_cta_enabled ?? false,
          whatsapp_cta_numero: (t as any).whatsapp_cta_numero || "",
          whatsapp_cta_texto_botao: (t as any).whatsapp_cta_texto_botao || "Falar no WhatsApp",
          whatsapp_cta_mensagem_inicial: (t as any).whatsapp_cta_mensagem_inicial || "Olá! Vim pelo email da {{empresa}}.",
          whatsapp_cta_posicao: ((t as any).whatsapp_cta_posicao || "rodape") as "topo" | "rodape",
        };
        setForm(loaded);
        setOriginalForm(loaded);
        setImageMode(loaded.imagem_url ? "url" : "upload");
        setLoaded(true);
      }
    }
  }, [isEditing, id, templates]);

  const hasChanges = JSON.stringify(form) !== JSON.stringify(originalForm);

  // Unsaved changes guard (beforeunload only, since BrowserRouter doesn't support useBlocker)

  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      if (!tenantEmpresaId) throw new Error("Empresa não encontrada");
      const { public_url } = await uploadCampaignImage({
        file,
        empresaId: tenantEmpresaId,
        context: "email_template",
      });
      setForm((prev) => ({ ...prev, imagem_url: public_url }));
      toast.success("Imagem carregada!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer upload");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (goBack = false) => {
    if (!form.nome.trim() || !form.corpo_texto.trim()) {
      toast.error("Nome e corpo do template são obrigatórios");
      return;
    }
    const allText = form.corpo_texto + " " + form.assunto_email;
    const foundVars = allText.match(/\{\{[^}]+\}\}/g) || [];
    const invalidVars = [...new Set(foundVars.filter((v) => !ALLOWED_VARS.includes(v)))];
    if (invalidVars.length > 0) {
      toast.error(`Variáveis inválidas: ${invalidVars.join(", ")}`);
      return;
    }
    try {
      setIsSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      // CRITICAL: empresa from URL tenant context, not from profile.empresa_id.
      if (!tenantEmpresaId) throw new Error("Empresa não encontrada");
      const profile = { empresa_id: tenantEmpresaId };

      const ctaPayload = {
        whatsapp_cta_enabled: form.whatsapp_cta_enabled,
        whatsapp_cta_numero: form.whatsapp_cta_enabled ? form.whatsapp_cta_numero || null : null,
        whatsapp_cta_texto_botao: form.whatsapp_cta_enabled ? form.whatsapp_cta_texto_botao || null : null,
        whatsapp_cta_mensagem_inicial: form.whatsapp_cta_enabled ? form.whatsapp_cta_mensagem_inicial || null : null,
        whatsapp_cta_posicao: form.whatsapp_cta_enabled ? form.whatsapp_cta_posicao : null,
      };

      if (isEditing && id) {
        await updateTemplate.mutateAsync({
          id,
          nome: form.nome,
          categoria: form.categoria,
          assunto_email: form.assunto_email || null,
          corpo_texto: form.corpo_texto,
          imagem_url: form.imagem_url || null,
          ...ctaPayload,
        } as any);
        toast.success("Template atualizado!");
        setOriginalForm(form);
      } else {
        await createTemplate.mutateAsync({
          nome: form.nome,
          canal: "email",
          categoria: form.categoria,
          assunto_email: form.assunto_email || null,
          corpo_texto: form.corpo_texto,
          imagem_url: form.imagem_url || null,
          empresa_id: profile.empresa_id,
          ativo: true,
          ...ctaPayload,
        } as any);
        toast.success("Template criado!");
        setOriginalForm(form);
      }
      if (goBack) navigate(-1);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar template");
    } finally {
      setIsSaving(false);
    }
  };

  const previewHtml = form.corpo_texto
    .replace(/\{\{(\w+)\}\}/g, '<span style="background:#dbeafe;color:#1d4ed8;padding:1px 4px;border-radius:3px;font-size:0.85em;">{{$1}}</span>');

  return (
    <OrbitLayout>
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div className="text-sm text-muted-foreground">
            <span className="hover:underline cursor-pointer" onClick={() => navigate(-1)}>Templates</span>
            <span className="mx-1">/</span>
            <span className="text-foreground font-medium">
              {isEditing ? "Editar template de email" : "Novo template de email"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {showPreview ? "Ocultar preview" : "Preview"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleSave(false)} disabled={isSaving || !hasChanges}>
            {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            <Save className="h-4 w-4 mr-1" /> Salvar
          </Button>
          <Button size="sm" onClick={() => handleSave(true)} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar e voltar
          </Button>
        </div>
      </div>

      {!loaded ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className={`grid gap-6 ${showPreview ? "lg:grid-cols-[1fr_400px]" : "grid-cols-1 max-w-4xl"}`}>
          {/* Left - Editor */}
          <div className="space-y-5">
            {/* Meta fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Nome do template</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Newsletter mensal" className="mt-1" />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Assunto do email</Label>
              <Input value={form.assunto_email} onChange={(e) => setForm({ ...form, assunto_email: e.target.value })} placeholder="Assunto que aparecerá na caixa de entrada" className="mt-1" />
            </div>

            {/* Image */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Imagem de cabeçalho (opcional)</Label>
                <div className="flex gap-1">
                  <Button type="button" variant={imageMode === "upload" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setImageMode("upload")}>
                    <ImagePlus className="h-3 w-3 mr-1" />Upload
                  </Button>
                  <Button type="button" variant={imageMode === "url" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setImageMode("url")}>
                    <Link className="h-3 w-3 mr-1" />URL
                  </Button>
                </div>
              </div>
              {form.imagem_url && (
                <div className="relative mb-2">
                  <img src={form.imagem_url} alt="Preview" className="w-full h-32 object-cover rounded border" />
                  <Button type="button" variant="destructive" size="sm" className="absolute top-1 right-1 h-7 w-7 p-0" onClick={() => setForm({ ...form, imagem_url: "" })}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {!form.imagem_url && imageMode === "upload" && (
                <div className="relative">
                  <Input type="file" accept="image/*" onChange={handleImageUpload} disabled={isUploading} className="cursor-pointer" />
                  {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded"><Loader2 className="h-4 w-4 animate-spin" /></div>}
                </div>
              )}
              {!form.imagem_url && imageMode === "url" && (
                <Input placeholder="https://exemplo.com/imagem.jpg" value={form.imagem_url} onChange={(e) => setForm({ ...form, imagem_url: e.target.value })} />
              )}
            </div>

            {/* Editor */}
            <div>
              <Label className="mb-2 block">Corpo do email</Label>
              <EmailTemplateEditor
                content={form.corpo_texto}
                onChange={(html) => setForm((prev) => ({ ...prev, corpo_texto: html }))}
              />
            </div>

            {/* WhatsApp CTA Button */}
            <Card className="border-green-500/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-green-500" />
                    Botão WhatsApp no email
                  </CardTitle>
                  <Switch
                    checked={form.whatsapp_cta_enabled}
                    onCheckedChange={(c) => setForm({ ...form, whatsapp_cta_enabled: c })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Adiciona um botão "Falar no WhatsApp" no email. O lead clica e abre direto a conversa com o consultor.
                </p>
              </CardHeader>
              {form.whatsapp_cta_enabled && (
                <CardContent className="space-y-3 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Número (formato E.164)</Label>
                      <Input
                        placeholder="+5511999999999"
                        value={form.whatsapp_cta_numero}
                        onChange={(e) => setForm({ ...form, whatsapp_cta_numero: e.target.value })}
                        className="mt-1 h-9"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">Ex: +55 11 99999-9999 → +5511999999999</p>
                    </div>
                    <div>
                      <Label className="text-xs">Texto do botão</Label>
                      <Input
                        placeholder="Falar no WhatsApp"
                        value={form.whatsapp_cta_texto_botao}
                        onChange={(e) => setForm({ ...form, whatsapp_cta_texto_botao: e.target.value })}
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Mensagem inicial pré-preenchida</Label>
                    <Input
                      placeholder="Olá! Vim pelo email da {{empresa}}."
                      value={form.whatsapp_cta_mensagem_inicial}
                      onChange={(e) => setForm({ ...form, whatsapp_cta_mensagem_inicial: e.target.value })}
                      className="mt-1 h-9"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {["{{nome}}", "{{empresa}}"].map(v => (
                        <Badge
                          key={v}
                          variant="outline"
                          className="text-[10px] font-mono cursor-pointer hover:bg-muted"
                          onClick={() => setForm({ ...form, whatsapp_cta_mensagem_inicial: form.whatsapp_cta_mensagem_inicial + " " + v })}
                        >
                          + {v}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Posição no email</Label>
                    <Select
                      value={form.whatsapp_cta_posicao}
                      onValueChange={(v: "topo" | "rodape") => setForm({ ...form, whatsapp_cta_posicao: v })}
                    >
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="topo">Topo (acima do conteúdo)</SelectItem>
                        <SelectItem value="rodape">Rodapé (abaixo do conteúdo)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Signature note */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border text-sm text-muted-foreground">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>A assinatura do usuário responsável será aplicada automaticamente no envio.</span>
            </div>
          </div>

          {/* Right - Preview */}
          {showPreview && (
            <div className="space-y-4">
              <div className="sticky top-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Eye className="h-4 w-4" /> Preview do email
                </h3>
                <div className="border rounded-lg bg-white overflow-hidden shadow-sm">
                  {/* Email header simulation */}
                  <div className="px-4 py-3 border-b bg-muted/20 space-y-1">
                     <p className="text-xs text-black/60">
                       <span className="font-medium text-black">Assunto:</span>{" "}
                       {form.assunto_email || <span className="italic">Sem assunto</span>}
                     </p>
                    {form.categoria && (
                      <Badge variant="secondary" className="text-xs">{form.categoria}</Badge>
                    )}
                  </div>

                  {/* Email body */}
                  <div className="p-6">
                    {form.imagem_url && (
                      <img src={form.imagem_url} alt="Header" className="w-full h-auto rounded mb-4" />
                    )}

                    {form.whatsapp_cta_enabled && form.whatsapp_cta_posicao === "topo" && (
                      <CtaPreviewButton text={form.whatsapp_cta_texto_botao || "Falar no WhatsApp"} />
                    )}

                    {form.corpo_texto ? (
                       <div
                         className="prose prose-sm max-w-none text-black [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1.5"
                         dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }}
                       />
                    ) : (
                      <p className="text-muted-foreground italic text-sm">O conteúdo do email aparecerá aqui...</p>
                    )}

                    {form.whatsapp_cta_enabled && form.whatsapp_cta_posicao === "rodape" && (
                      <CtaPreviewButton text={form.whatsapp_cta_texto_botao || "Falar no WhatsApp"} />
                    )}

                    {/* Signature simulation */}
                    <div className="mt-8 pt-4 border-t border-dashed border-muted-foreground/30">
                      <p className="text-xs text-muted-foreground italic">— Assinatura do responsável —</p>
                      <p className="text-xs text-muted-foreground mt-1">João Silva</p>
                      <p className="text-xs text-muted-foreground">Executivo de Vendas</p>
                      <p className="text-xs text-muted-foreground">joao@empresa.com.br</p>
                    </div>
                  </div>
                </div>

                {/* Available variables */}
                <div className="mt-4 p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs font-medium mb-2">Variáveis disponíveis:</p>
                  <div className="flex flex-wrap gap-1">
                    {ALLOWED_VARS.map((v) => (
                      <Badge key={v} variant="outline" className="text-xs font-mono">{v}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

    </OrbitLayout>
  );
}

function CtaPreviewButton({ text }: { text: string }) {
  return (
    <div className="my-4 text-center">
      <span
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-white font-semibold text-sm shadow-sm"
        style={{ backgroundColor: "#25D366" }}
      >
        <MessageCircle className="h-4 w-4" /> {text}
      </span>
    </div>
  );
}
