import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  MessageCircle,
  Mail,
  Copy,
  Pencil,
  Trash2,
  Sparkles,
} from "lucide-react";

const mockTemplates = {
  whatsapp: [
    {
      id: "1",
      nome: "Primeira Abordagem",
      categoria: "prospecção",
      conteudo:
        "Olá {{nome}}! Vi que vocês trabalham com {{segmento}}. Temos soluções que podem ajudar a aumentar sua produtividade em até 40%. Podemos conversar?",
      variaveis: ["nome", "segmento"],
      uso: 156,
    },
    {
      id: "2",
      nome: "Follow-up 3 dias",
      categoria: "follow-up",
      conteudo:
        "Oi {{nome}}, tudo bem? Vi que você demonstrou interesse anteriormente. Gostaria de agendar uma conversa rápida de 15 minutos essa semana?",
      variaveis: ["nome"],
      uso: 89,
    },
    {
      id: "3",
      nome: "Proposta Enviada",
      categoria: "proposta",
      conteudo:
        "{{nome}}, acabei de enviar a proposta para seu email. Qualquer dúvida, estou à disposição! Quando podemos conversar sobre os próximos passos?",
      variaveis: ["nome"],
      uso: 45,
    },
  ],
  email: [
    {
      id: "4",
      nome: "Introdução Formal",
      categoria: "prospecção",
      conteudo:
        "Prezado(a) {{nome}},\n\nMeu nome é {{remetente}} e trabalho na {{empresa}}. Gostaria de apresentar nossa solução que tem ajudado empresas como a {{empresa_prospect}} a...",
      variaveis: ["nome", "remetente", "empresa", "empresa_prospect"],
      uso: 234,
    },
    {
      id: "5",
      nome: "Case de Sucesso",
      categoria: "nurturing",
      conteudo:
        "Olá {{nome}},\n\nQuero compartilhar um case que pode ser relevante para vocês. A empresa X aumentou suas vendas em 60% após implementar nossa solução...",
      variaveis: ["nome"],
      uso: 78,
    },
  ],
};

const categoriaColors: Record<string, string> = {
  prospecção: "bg-primary/20 text-primary",
  "follow-up": "bg-warning/20 text-warning",
  proposta: "bg-success/20 text-success",
  nurturing: "bg-accent/20 text-accent",
};

export default function TemplatesPage() {
  return (
    <OrbitLayout>
      <PageHeader
        title="Templates"
        description="Gerencie seus modelos de mensagem"
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary">
              <Sparkles className="w-4 h-4 mr-2" />
              Gerar com IA
            </Button>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Novo Template
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="whatsapp">
        <TabsList>
          <TabsTrigger value="whatsapp" className="gap-2">
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            <Mail className="w-4 h-4" />
            Email
          </TabsTrigger>
        </TabsList>

        {["whatsapp", "email"].map((tipo) => (
          <TabsContent key={tipo} value={tipo} className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {mockTemplates[tipo as keyof typeof mockTemplates].map(
                (template) => (
                  <div key={template.id} className="glass-card p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold">{template.nome}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            className={
                              categoriaColors[template.categoria] ||
                              "bg-muted text-muted-foreground"
                            }
                          >
                            {template.categoria}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {template.uso} usos
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon">
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-secondary/50 text-sm">
                      <p className="whitespace-pre-wrap line-clamp-4">
                        {template.conteudo}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {template.variaveis.map((v) => (
                        <span
                          key={v}
                          className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary"
                        >
                          {`{{${v}}}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </OrbitLayout>
  );
}
