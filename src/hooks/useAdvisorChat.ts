import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

export interface AdvisorMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
}

/**
 * Chat streaming com o Orbit Advisor. Faz POST direto na edge function e
 * consome o SSE (chunks JSON) — não usa supabase.functions.invoke pois esse
 * método é buffered e mata o streaming.
 */
export function useAdvisorChat() {
  const { empresaId } = useTenant();
  const [messages, setMessages] = useState<AdvisorMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string) => {
      if (!empresaId || !text.trim() || isStreaming) return;

      const userMsg: AdvisorMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: text.trim(),
      };
      const assistantId = crypto.randomUUID();
      setMessages((m) => [
        ...m,
        userMsg,
        { id: assistantId, role: "assistant", text: "", streaming: true },
      ]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("sem sessão");

        const url = `${
          import.meta.env.VITE_SUPABASE_URL
        }/functions/v1/orbit-advisor-chat`;
        const res = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            empresa_id: empresaId,
            thread_id: threadId,
            message: text.trim(),
          }),
        });

        if (!res.ok || !res.body) {
          const err = await res.text().catch(() => "");
          throw new Error(err || `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const payload = t.slice(5).trim();
            try {
              const j = JSON.parse(payload);
              if (j.type === "meta" && j.thread_id) {
                setThreadId(j.thread_id);
              } else if (j.type === "chunk" && typeof j.text === "string") {
                setMessages((m) =>
                  m.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, text: msg.text + j.text }
                      : msg,
                  ),
                );
              } else if (j.type === "done") {
                setMessages((m) =>
                  m.map((msg) =>
                    msg.id === assistantId ? { ...msg, streaming: false } : msg,
                  ),
                );
              }
            } catch {}
          }
        }
      } catch (e) {
        toast.error("Advisor indisponível", { description: (e as Error).message });
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? { ...msg, text: "_erro ao consultar o advisor_", streaming: false }
              : msg,
          ),
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [empresaId, threadId, isStreaming],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setThreadId(null);
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, send, reset, threadId };
}
