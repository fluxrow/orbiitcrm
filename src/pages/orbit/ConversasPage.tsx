import { useState } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { ConversationItem } from "@/components/orbit/ConversationItem";
import { ChatMessage } from "@/components/orbit/ChatMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Send,
  Paperclip,
  Smile,
  Phone,
  Video,
  MoreVertical,
  Sparkles,
  MessageCircle,
  Instagram,
  Mail,
} from "lucide-react";

const mockConversations = [
  {
    id: "1",
    nome: "João Silva",
    ultimaMensagem: "Perfeito, vamos agendar a reunião",
    data: "10:30",
    naoLidas: 2,
    canal: "whatsapp" as const,
  },
  {
    id: "2",
    nome: "Maria Santos",
    ultimaMensagem: "Enviamos a proposta por email",
    data: "Ontem",
    naoLidas: 0,
    canal: "email" as const,
  },
  {
    id: "3",
    nome: "Pedro Costa",
    ultimaMensagem: "Vi seu perfil e gostaria de saber mais",
    data: "Ontem",
    naoLidas: 1,
    canal: "instagram" as const,
  },
];

const mockMessages = [
  {
    id: "1",
    conteudo: "Olá! Vi que vocês trabalham com automação. Gostaria de saber mais sobre os serviços.",
    tipo: "recebida" as const,
    data: "2024-01-15T10:00:00",
    canal: "whatsapp" as const,
  },
  {
    id: "2",
    conteudo: "Olá João! Sim, trabalhamos com automação de processos empresariais. Posso te explicar melhor?",
    tipo: "enviada" as const,
    data: "2024-01-15T10:05:00",
    status: "lida" as const,
    canal: "whatsapp" as const,
  },
  {
    id: "3",
    conteudo: "Claro! Vocês atendem empresas de médio porte? Temos cerca de 50 funcionários.",
    tipo: "recebida" as const,
    data: "2024-01-15T10:15:00",
    canal: "whatsapp" as const,
  },
  {
    id: "4",
    conteudo: "Com certeza! Temos soluções específicas para empresas do seu porte. Podemos agendar uma demonstração?",
    tipo: "enviada" as const,
    data: "2024-01-15T10:20:00",
    status: "entregue" as const,
    canal: "whatsapp" as const,
  },
  {
    id: "5",
    conteudo: "Perfeito, vamos agendar a reunião",
    tipo: "recebida" as const,
    data: "2024-01-15T10:30:00",
    canal: "whatsapp" as const,
  },
];

export default function ConversasPage() {
  const [activeConversation, setActiveConversation] = useState(mockConversations[0]);
  const [messageInput, setMessageInput] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  return (
    <OrbitLayout>
      <div className="flex h-[calc(100vh-3rem)] -m-6">
        {/* Conversations List */}
        <div className="w-80 border-r border-border flex flex-col bg-card/50">
          <div className="p-4 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar conversas..." className="pl-10" />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 py-2">
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1">Todas</TabsTrigger>
              <TabsTrigger value="whatsapp" className="flex-1">
                <MessageCircle className="w-4 h-4" />
              </TabsTrigger>
              <TabsTrigger value="instagram" className="flex-1">
                <Instagram className="w-4 h-4" />
              </TabsTrigger>
              <TabsTrigger value="email" className="flex-1">
                <Mail className="w-4 h-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex-1 overflow-auto p-2 space-y-1">
            {mockConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={activeConversation.id === conv.id}
                onClick={() => setActiveConversation(conv)}
              />
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                <span className="font-medium">
                  {activeConversation.nome.charAt(0)}
                </span>
              </div>
              <div>
                <h2 className="font-semibold">{activeConversation.nome}</h2>
                <p className="text-xs text-muted-foreground">
                  Online agora
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon">
                <Phone className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon">
                <Video className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto p-6 space-y-4">
            {mockMessages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
          </div>

          {/* Message Input */}
          <div className="p-4 border-t border-border bg-card/50">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon">
                <Paperclip className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Smile className="w-5 h-5" />
              </Button>
              <Input
                placeholder="Digite sua mensagem..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                className="flex-1"
              />
              <Button variant="ghost" size="icon" className="text-primary">
                <Sparkles className="w-5 h-5" />
              </Button>
              <Button size="icon">
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              <Sparkles className="w-3 h-3 inline mr-1" />
              Pressione IA para gerar resposta automática
            </p>
          </div>
        </div>
      </div>
    </OrbitLayout>
  );
}
