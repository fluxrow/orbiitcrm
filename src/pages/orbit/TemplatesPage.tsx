import { useState } from "react";
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
import { Plus, Sparkles, Copy, Trash2, Pencil, MessageSquare, Mail, Loader2 } from "lucide-react";
import { useOrbitTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from "@/hooks/useOrbitTemplates";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
}

const emptyForm: TemplateForm = { nome: "", categoria: "geral", assunto_email: "", corpo_texto: "" };

export default function TemplatesPage() {
  const [tab, setTab] = useState("whatsapp");
  const { data: templates, isLoading } = useOrbitTemplates({ canal: tab });
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  // Dialog states
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  // AI dialog states
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiObjetivo, setAiObjetivo] = useState("");
  const [aiCategoria, setAiCategoria] = useState("geral");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<TemplateForm | null>(null);

  const isEmail = tab === "email";

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowDialog(true);
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      nome: t.nome,
      categoria: t.categoria || "geral",
      assunto_email: t.assunto_email || "",
      corpo_texto: t.corpo_texto || "",
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.corpo_texto.trim()) {
      toast.error("Nome e corpo do template são obrigatórios");
      return;
    }
    try {
      setIsSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      const { data: profile } = await supabase.from("profiles").select("empresa_id").eq("id", user.id).single();
      if (!profile?.empresa_id) throw new Error("Empresa não encontrada");

      if (editingId) {
        await updateTemplate.mutateAsync({
          id: editingId,
          nome: form.nome,
          categoria: form.categoria,
          assunto_email: isEmail ? form.assunto_email : null,
          corpo_texto: form.corpo_texto,
        });
        toast.success("Template atualizado!");
      } else {
        await createTemplate.mutateAsync({
          nome: form.nome,
          canal: tab,
          categoria: form.categoria,
          assunto_email: isEmail ? form.assunto_email : null,
          corpo_texto: form.corpo_texto,
          empresa_id: profile.empresa_id,
          ativo: true,
        });
        toast.success("Template criado!");
      }
      setShowDialog(false);
      setForm(emptyForm);
      setEditingId(null);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar template");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateAi = async () => {
    if (!aiObjetivo.trim()) {
      toast.error("Descreva o objetivo do template");
      return;
    }
    try {
      setIsGenerating(true);
      setAiResult(null);
      const { data, error } = await supabase.functions.invoke("orbit-ai-generate-template", {
        body: { canal: tab, categoria: aiCategoria, objetivo: aiObjetivo },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message || "Erro na geração");
      setAiResult({
        nome: data.data.nome,
        categoria: data.data.categoria || aiCategoria,
        assunto_email: data.data.assunto_email || "",
        corpo_texto: data.data.corpo_texto || "",
      });
    } catch (error: any) {
      toast.error(error.message || "Erro ao gerar template com IA");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAiResult = () => {
    if (aiResult) {
      setForm(aiResult);
      setEditingId(null);
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
            <Button size="sm" onClick={openNew}>
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
                  {t.assunto_email && (
                    <p className="text-xs text-muted-foreground mb-2">Assunto: {t.assunto_email}</p>
                  )}
                  <div className="bg-muted/50 rounded p-3 mb-3">
                    <p className="text-sm text-muted-foreground line-clamp-4">{t.corpo_texto || "Sem conteúdo"}</p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
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

      {/* Dialog de criação/edição */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Template" : "Novo Template"}</DialogTitle>
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
            {isEmail && (
              <div>
                <Label>Assunto do Email</Label>
                <Input value={form.assunto_email} onChange={(e) => setForm({ ...form, assunto_email: e.target.value })} placeholder="Assunto do email" />
              </div>
            )}
            <div>
              <Label>Corpo do Template</Label>
              <Textarea value={form.corpo_texto} onChange={(e) => setForm({ ...form, corpo_texto: e.target.value })} placeholder="Digite o conteúdo do template..." rows={6} />
              <p className="text-xs text-muted-foreground mt-1">Use variáveis: {"{{nome}}"}, {"{{empresa}}"}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de geração por IA */}
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
