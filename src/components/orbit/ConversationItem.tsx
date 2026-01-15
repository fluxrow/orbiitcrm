import { cn } from "@/lib/utils";
import { MessageCircle, Mail, Instagram } from "lucide-react";

interface ConversationItemProps {
  conversation: {
    id: string;
    nome: string;
    ultimaMensagem: string;
    data: string;
    naoLidas: number;
    canal: "whatsapp" | "instagram" | "email";
    avatar?: string;
  };
  isActive?: boolean;
  onClick?: () => void;
}

const canalConfig = {
  whatsapp: { icon: MessageCircle, color: "text-channel-whatsapp" },
  instagram: { icon: Instagram, color: "text-channel-instagram" },
  email: { icon: Mail, color: "text-channel-email" },
};

export function ConversationItem({ conversation, isActive, onClick }: ConversationItemProps) {
  const canal = canalConfig[conversation.canal];

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200",
        isActive
          ? "bg-primary/10 border-l-2 border-primary"
          : "hover:bg-secondary/50"
      )}
      onClick={onClick}
    >
      <div className="relative">
        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
          <span className="text-lg font-medium">
            {conversation.nome.charAt(0).toUpperCase()}
          </span>
        </div>
        <div
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center",
            conversation.canal === "whatsapp" && "bg-channel-whatsapp",
            conversation.canal === "instagram" && "bg-channel-instagram",
            conversation.canal === "email" && "bg-channel-email"
          )}
        >
          <canal.icon className="w-3 h-3 text-white" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-medium truncate">{conversation.nome}</span>
          <span className="text-[10px] text-muted-foreground">
            {conversation.data}
          </span>
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {conversation.ultimaMensagem}
        </p>
      </div>

      {conversation.naoLidas > 0 && (
        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <span className="text-[10px] font-bold text-primary-foreground">
            {conversation.naoLidas}
          </span>
        </div>
      )}
    </div>
  );
}
