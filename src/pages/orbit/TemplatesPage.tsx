import { useState } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Sparkles, Copy, Trash2, MessageSquare, Mail, Loader2 } from "lucide-react";
import { useOrbitTemplates, useDeleteTemplate } from "@/hooks/useOrbitTemplates";
import { toast } from "sonner";

export default function TemplatesPage() {
  const [tab, setTab] = useState("whatsapp");
  const { data: templates, isLoading } = useOrbitTemplates({ canal: tab });
  const deleteTemplate = useDeleteTemplate();

  return (
    <OrbitLayout>
      <PageHeader title="Templates" description="Modelos de mensagem" actions={<><Button variant="outline" size="sm"><Sparkles className="h-4 w-4 mr-2" />Gerar IA</Button><Button size="sm"><Plus className="h-4 w-4 mr-2" />Novo</Button></>} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6"><TabsTrigger value="whatsapp"><MessageSquare className="h-4 w-4 mr-2" />WhatsApp</TabsTrigger><TabsTrigger value="email"><Mail className="h-4 w-4 mr-2" />Email</TabsTrigger></TabsList>
        <TabsContent value={tab}>
          {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div> : templates?.length === 0 ? <div className="text-center py-12 text-muted-foreground">Nenhum template</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates?.map((t) => (
                <div key={t.id} className="bg-card border rounded-lg p-4">
                  <div className="flex justify-between mb-3"><h3 className="font-semibold">{t.nome}</h3><Badge variant="secondary">{t.categoria}</Badge></div>
                  <div className="bg-muted/50 rounded p-3 mb-3"><p className="text-sm text-muted-foreground line-clamp-4">{t.corpo_texto || "Sem conteúdo"}</p></div>
                  <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(t.corpo_texto || ""); toast.success("Copiado!"); }}><Copy className="h-4 w-4" /></Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteTemplate.mutateAsync(t.id)}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </OrbitLayout>
  );
}
