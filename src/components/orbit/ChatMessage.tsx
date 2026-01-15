import { cn } from "@/lib/utils";
import { Check, CheckCheck } from "lucide-react";

interface ChatMessageProps {
  message: {
    id: string;
    conteudo: string;
    tipo: "enviada" | "recebida";
    data: string;
    status?: "enviando" | "enviada" | "entregue" | "lida";
    canal: "whatsapp" | "instagram" | "email";
  };
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isOutgoing = message.tipo === "enviada";

  const statusIcon = () => {
    if (!isOutgoing) return null;
    switch (message.status) {
      case "enviando":
        return <div className="w-3 h-3 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />;
      case "enviada":
        return <Check className="w-3.5 h-3.5 text-muted-foreground" />;
      case "entregue":
        return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground" />;
      case "lida":
        return <CheckCheck className="w-3.5 h-3.5 text-primary" />;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        "flex",
        isOutgoing ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-4 py-2.5",
          isOutgoing
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-secondary text-foreground rounded-bl-md"
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{message.conteudo}</p>
        <div
          className={cn(
            "flex items-center justify-end gap-1 mt-1 text-[10px]",
            isOutgoing ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          <span>
            {new Date(message.data).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {statusIcon()}
        </div>
      </div>
    </div>
  );
}
