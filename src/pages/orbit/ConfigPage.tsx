import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { IntegrationCard } from "@/components/orbit/IntegrationCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageCircle,
  Instagram,
  Mail,
  Search,
  Sparkles,
  Users,
  Save,
} from "lucide-react";

export default function ConfigPage() {
  return (
    <OrbitLayout>
      <PageHeader
        title="Configurações"
        description="Configure integrações e preferências do ORBIT"
      />

      <Tabs defaultValue="integrations">
        <TabsList>
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
          <TabsTrigger value="ai">Configurações IA</TabsTrigger>
          <TabsTrigger value="distribution">Distribuição de Leads</TabsTrigger>
          <TabsTrigger value="general">Geral</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <IntegrationCard
              name="Z-API (WhatsApp)"
              description="Integração não-oficial para envio de mensagens via WhatsApp"
              icon={MessageCircle}
              iconBg="bg-channel-whatsapp"
              status="disconnected"
            />
            <IntegrationCard
              name="Meta Graph API"
              description="Instagram e Facebook Messenger através da API oficial"
              icon={Instagram}
              iconBg="bg-channel-instagram"
              status="disconnected"
            />
            <IntegrationCard
              name="Resend"
              description="Envio de emails transacionais e campanhas"
              icon={Mail}
              iconBg="bg-channel-email"
              status="disconnected"
            />
            <IntegrationCard
              name="Apollo.io"
              description="Busca e enriquecimento de leads B2B"
              icon={Search}
              iconBg="bg-primary"
              status="disconnected"
            />
          </div>
        </TabsContent>

        <TabsContent value="ai" className="mt-6">
          <div className="glass-card p-6 max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-primary/20">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Configurações da IA</h3>
                <p className="text-sm text-muted-foreground">
                  Personalize o comportamento do assistente
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <Label>Tom de Comunicação</Label>
                <Textarea
                  className="mt-2"
                  placeholder="Descreva o tom que a IA deve usar nas mensagens..."
                  defaultValue="Profissional e amigável. Use linguagem clara e objetiva, evitando jargões técnicos. Seja cordial mas direto ao ponto."
                  rows={4}
                />
              </div>

              <div>
                <Label>Instruções Personalizadas</Label>
                <Textarea
                  className="mt-2"
                  placeholder="Adicione instruções específicas para a IA..."
                  defaultValue="Sempre mencione o nome do prospect. Foque em benefícios, não em características. Faça perguntas abertas para engajar."
                  rows={4}
                />
              </div>

              <div>
                <Label>Informações da Empresa</Label>
                <Textarea
                  className="mt-2"
                  placeholder="Descreva sua empresa para contexto..."
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Sugestões Automáticas</Label>
                  <p className="text-sm text-muted-foreground">
                    Gerar sugestões de resposta automaticamente
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Qualificação por IA</Label>
                  <p className="text-sm text-muted-foreground">
                    Qualificar leads automaticamente com base nas conversas
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <Button>
                <Save className="w-4 h-4 mr-2" />
                Salvar Configurações
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="distribution" className="mt-6">
          <div className="glass-card p-6 max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-primary/20">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Distribuição de Leads</h3>
                <p className="text-sm text-muted-foreground">
                  Configure como os novos leads são distribuídos
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Distribuição Automática</Label>
                  <p className="text-sm text-muted-foreground">
                    Distribuir novos leads automaticamente entre a equipe
                  </p>
                </div>
                <Switch />
              </div>

              <div>
                <Label>Método de Distribuição</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className="p-4 rounded-lg border-2 border-primary bg-primary/5 cursor-pointer">
                    <p className="font-medium">Round Robin</p>
                    <p className="text-sm text-muted-foreground">
                      Distribui igualmente entre a equipe
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border border-border cursor-pointer hover:border-primary/50">
                    <p className="font-medium">Por Capacidade</p>
                    <p className="text-sm text-muted-foreground">
                      Baseado na carga de trabalho atual
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <Label>Limite por Usuário</Label>
                <Input
                  type="number"
                  className="mt-2 max-w-32"
                  placeholder="50"
                  defaultValue={50}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Máximo de leads ativos por usuário
                </p>
              </div>

              <Button>
                <Save className="w-4 h-4 mr-2" />
                Salvar Configurações
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="general" className="mt-6">
          <div className="glass-card p-6 max-w-2xl">
            <h3 className="font-semibold mb-6">Configurações Gerais</h3>

            <div className="space-y-6">
              <div>
                <Label>Nome do CRM</Label>
                <Input
                  className="mt-2"
                  placeholder="ORBIT CRM"
                  defaultValue="ORBIT CRM"
                />
              </div>

              <div>
                <Label>Prefixo das Tabelas</Label>
                <Input
                  className="mt-2"
                  placeholder="orbit_"
                  defaultValue="orbit_"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Prefixo usado nas tabelas do banco de dados
                </p>
              </div>

              <div>
                <Label>Fuso Horário</Label>
                <Input
                  className="mt-2"
                  placeholder="America/Sao_Paulo"
                  defaultValue="America/Sao_Paulo"
                />
              </div>

              <Button>
                <Save className="w-4 h-4 mr-2" />
                Salvar Configurações
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </OrbitLayout>
  );
}
