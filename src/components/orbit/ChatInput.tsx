import { forwardRef, useRef, type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Chamado quando o usuário confirma o envio (Enter). */
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * Campo de mensagem global do Orbit.
 *
 * REGRAS DE TECLADO (padrão WhatsApp/Slack):
 *  • Enter            → envia
 *  • Shift+Enter      → nova linha
 *  • Ctrl+Shift+Enter → nova linha
 *  • Alt/Meta+Enter   → nova linha
 *
 * IME: durante composição (acentos, teclados asiáticos) o Enter NUNCA envia —
 * ele confirma a composição. Detectado por `isComposing`/`keyCode === 229`.
 * O envio também é ignorado enquanto `disabled` (ex.: upload em andamento).
 */
export const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(function ChatInput(
  { value, onChange, onSend, placeholder = "Mensagem...", disabled, className, ...rest },
  ref,
) {
  const composingRef = useRef(false);

  const insertNewline = (el: HTMLTextAreaElement) => {
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}\n${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 1;
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;

    // IME em composição: deixa o Enter confirmar o texto, nunca envia.
    if (composingRef.current || (e.nativeEvent as any)?.isComposing || (e.nativeEvent as any)?.keyCode === 229) {
      return;
    }

    const wantsNewline = e.shiftKey || e.altKey || e.metaKey;
    if (wantsNewline) {
      e.preventDefault();
      insertNewline(e.currentTarget);
      return;
    }

    e.preventDefault();
    if (disabled) return;
    onSend();
  };

  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={() => { composingRef.current = false; }}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      rows={1}
      className={cn("min-h-10 max-h-32 resize-none py-2", className)}
      {...rest}
    />
  );
});
