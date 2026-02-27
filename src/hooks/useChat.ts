import { useState, useCallback, useRef } from "react";
import type { Message } from "@/lib/types";

export function useChat(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/conversations/${convId}/messages`);
      const data = await res.json();
      setMessages(
        data.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      );
    } catch {
      console.error("Failed to load messages");
    }
  }, []);

  const sendMessage = useCallback(
    // async (content: string) => {
    //   if (!conversationId) return;
    async (content: string, targetConversationId?: string | null) => {
      const activeConversationId = targetConversationId ?? conversationId;

      if (!activeConversationId) return;

      const userMessage: Message = { role: "user", content };
      const updatedMessages = [...messages, userMessage];

      setMessages([...updatedMessages, { role: "assistant", content: "" }]);
      setIsLoading(true);

      abortControllerRef.current = new AbortController();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages,
            conversationId: activeConversationId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok) throw new Error("Request failed");

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) throw new Error("No reader available");

        let assistantContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const data = line.slice(6).trim();
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);

              if (parsed.error) {
                assistantContent += `Error: ${parsed.error}`;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: assistantContent,
                  };
                  return updated;
                });
                break;
              }

              assistantContent += parsed.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                };
                return updated;
              });
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Error: Failed to connect",
          };
          return updated;
        });
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [messages, conversationId],
  );

  const stopGenerating = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  const clearMessages = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    stopGenerating,
    clearMessages,
    loadMessages,
  };
}
