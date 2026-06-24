import { useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import { useNavigate } from "react-router-dom";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Sparkles, Copy, Trash2, Pencil, MessageSquare, Mail, Loader2, ImagePlus, X, Link } from "lucide-react";
import { useOrbitTemplates, useCreateTemplate, useDeleteTemplate } from "@/hooks/useOrbitTemplates";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

const ALLOWED_VARS = ["{{nome}}", "{{empresa}}", "{{nome_fantasia}}", "{{email}}", "{{telefone}}", "{{cidade}}", "{{segmento}}"];

const CATEGORIAS = [
  { value: "geral", label: "Geral" },
  { value: "marketing", label: "Marketing" },
  { value: "vendas", label: "Vendas" },
  { value: "suporte", label: "Suporte" },
];

interface TemplateForm {
  nome: string;
  categoria: string;
  assunto_email: string;
  corpo_texto: string;
  imagem_url: string;
}

const emptyForm: TemplateForm = { nome: "", categoria: "geral", assunto_email: "", corpo_texto: "", imagem_url: "" };

export default function TemplatesPage() {
  const navigate = useNavigate();
  const { empresaId: tenantEmpresaId } = useTenant();
  const [tab, setTab] = useState("whatsapp");
  const { data: templates, isLoading } = useOrbitTemplates({ canal: tab });
  const createTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();

  // WhatsApp dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageMode, setImageMode] = useState<"upload" | "url">("upload");

  // AI dialog state
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiObjetivo, setAiObjetivo] = useState("");
  const [aiCategoria, setAiCategoria] = useState("geral");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<TemplateForm | null>(null);

  const isEmail = tab === "email";

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione um arquivo de imagem"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 5MB"); return; }
    try {
      setIsUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("campaign-images").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("campaign-images").getPublicUrl(path);
      setForm({ ...form, imagem_url: publicUrl });
      toast.success("Imagem carregada!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer upload");
    } finally {
      setIsUploading(false);
    }
  };

  const openNewWhatsApp = () => {
    setForm(emptyForm);
    setImageMode("upload");
    setShowDialog(true);
  };

  const handleNew = () => {
    if (isEmail) {
      navigate("email/new");
    } else {
      openNewWhatsApp();
    }
  };

  const handleEdit = (t: any) => {
    if (isEmail) {
      navigate(`email/${t.id}/edit`);
    } else {
      setForm({
        nome: t.nome,
        categoria: t.categoria || "geral",
        assunto_email: t.assunto_email || "",
        corpo_texto: t.corpo_texto || "",
        imagem_url: t.imagem_url || "",
      });
      setImageMode(t.imagem_url ? "url" : "upload");
      setShowDialog(true);
    }
  };

  const handleSaveWhatsApp = async () => {
    if (!form.nome.trim() || !form.corpo_texto.trim()) {
      toast.error("Nome e corpo do template são obrigatórios");
      return;
    }
    const foundVars = form.corpo_texto.match(/\{\{[^}]+\}\}/g) || [];
    const invalidVars = [...new Set(foundVars.filter(v => !ALLOWED_VARS.includes(v)))];
    if (invalidVars.length > 0) {
      toast.error(`Variáveis inválidas: ${invalidVars.join(", ")}. Permitidas: ${ALLOWED_VARS.join(", ")}`);
      return;
    }
    try {
      setIsSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      // CRITICAL: empresa from URL tenant context, not from profile.empresa_id.
      if (!tenantEmpresaId) throw new Error("Empresa não encontrada");
      const profile = { empresa_id: tenantEmpresaId };

      await createTemplate.mutateAsync({
        nome: form.nome,
        canal: "whatsapp",
        categoria: form.categoria,
        assunto_email: null,
        corpo_texto: form.corpo_texto,
        imagem_url: form.imagem_url || null,
        empresa_id: profile.empresa_id,
        ativo: true,
      });
      toast.success("Template criado!");
      setShowDialog(false);
      setForm(emptyForm);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar template");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateAi = async () => {
    if (!aiObjetivo.trim()) { toast.error("Descreva o objetivo do template"); return; }
    try {
      setIsGenerating(true);
      setAiResult(null);
      const { data, error } = await supabase.functions.invoke("orbit-ai-generate-template", {
        body: { canal: tab, categoria: aiCategoria, objetivo: aiObjetivo },
      });
      if (error) throw new Error(data?.error?.message || error.message || "Erro na geração");
      if (!data?.ok) throw new Error(data?.error?.message || "Erro na geração");
      setAiResult({
        nome: data.data.nome,
        categoria: data.data.categoria || aiCategoria,
        assunto_email: data.data.assunto_email || "",
        corpo_texto: data.data.corpo_texto || "",
        imagem_url: "",
      });
    } catch (error: any) {
      toast.error(error.message || "Erro ao gerar template com IA");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAiResult = () => {
    if (!aiResult) return;
    if (isEmail) {
      // Navigate to editor page with AI result as state
      navigate("email/new", { state: aiResult });
      setShowAiDialog(false);
      setAiResult(null);
      setAiObjetivo("");
    } else {
      setForm(aiResult);
      setShowAiDialog(false);
      setShowDialog(true);
      setAiResult(null);
      setAiObjetivo("");
    }
  };

  return (
    <OrbitLayout>
      <PageHeader
        title="Templates"
        description="Modelos de mensagem"
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => { setAiCategoria("geral"); setAiObjetivo(""); setAiResult(null); setShowAiDialog(true); }}>
              <Sparkles className="h-4 w-4 mr-2" />Gerar IA
            </Button>
            <Button size="sm" onClick={handleNew}>
              <Plus className="h-4 w-4 mr-2" />Novo
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="whatsapp"><MessageSquare className="h-4 w-4 mr-2" />WhatsApp</TabsTrigger>
          <TabsTrigger value="email"><Mail className="h-4 w-4 mr-2" />Email</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : templates?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhum template</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates?.map((t) => (
                <div key={t.id} className="bg-card border rounded-lg p-4">
                  <div className="flex justify-between mb-3">
                    <h3 className="font-semibold">{t.nome}</h3>
                    <Badge variant="secondary">{t.categoria}</Badge>
                  </div>
                  {(t as any).imagem_url && (
                    <img src={(t as any).imagem_url} alt="Template" className="w-full h-32 object-cover rounded mb-3" />
                  )}
                  {t.assunto_email && (
                    <p className="text-xs text-muted-foreground mb-2">Assunto: {t.assunto_email}</p>
                  )}
                  <div className="bg-muted/50 rounded p-3 mb-3">
                    {isEmail ? (
                      <div className="text-sm text-muted-foreground line-clamp-4" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(t.corpo_texto || "Sem conteúdo") }} />
                    ) : (
                      <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap">{t.corpo_texto || "Sem conteúdo"}</p>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(t.corpo_texto || ""); toast.success("Copiado!"); }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteTemplate.mutateAsync(t.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* WhatsApp dialog only */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Template WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Boas-vindas novo lead" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Image */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Imagem (opcional)</Label>
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
              <p className="text-xs text-muted-foreground mt-1">A imagem aparecerá antes do texto na mensagem</p>
            </div>
            <div>
              <Label>Corpo do Template</Label>
              <Textarea value={form.corpo_texto} onChange={(e) => setForm({ ...form, corpo_texto: e.target.value })} placeholder="Digite o conteúdo do template..." rows={6} />
              <p className="text-xs text-muted-foreground mt-1">Variáveis: {ALLOWED_VARS.join(", ")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveWhatsApp} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI generation dialog */}
      <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Gerar Template com IA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Canal</Label>
              <Input value={tab === "whatsapp" ? "WhatsApp" : "Email"} disabled />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={aiCategoria} onValueChange={setAiCategoria}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descreva o objetivo do template</Label>
              <Textarea value={aiObjetivo} onChange={(e) => setAiObjetivo(e.target.value)} placeholder="Ex: Follow-up após reunião de apresentação do produto" rows={3} />
            </div>
            <Button onClick={handleGenerateAi} disabled={isGenerating} className="w-full">
              {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {isGenerating ? "Gerando..." : "Gerar Template"}
            </Button>
            {aiResult && (
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <h4 className="font-semibold text-sm">Resultado gerado:</h4>
                <p className="text-sm"><strong>Nome:</strong> {aiResult.nome}</p>
                {aiResult.assunto_email && <p className="text-sm"><strong>Assunto:</strong> {aiResult.assunto_email}</p>}
                <div className="bg-background rounded p-3">
                  <p className="text-sm whitespace-pre-wrap">{aiResult.corpo_texto}</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAiDialog(false)}>Cancelar</Button>
            {aiResult && (
              <Button onClick={handleSaveAiResult}>
                <Pencil className="h-4 w-4 mr-2" />Editar e Salvar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrbitLayout>
  );
}
