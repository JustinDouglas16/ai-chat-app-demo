import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useChat } from "@/hooks/useChat";
import {
  Loader2,
  Trash2,
  BotMessageSquare,
  Square,
} from "lucide-react";

export function ChatContainer() {
  const { messages, isLoading, sendMessage, stopGenerating, clearMessages } =
    useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/50 bg-card/50 px-6 py-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-glow/20">
            <BotMessageSquare className="h-5 w-5 text-blue-bright" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              HF Chat
            </h1>
            <p className="text-xs text-muted-foreground">
              Powered by Hugging Face
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={clearMessages}
            disabled={messages.length === 0}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 py-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-glow/10 ring-1 ring-blue-glow/20">
                <BotMessageSquare className="h-8 w-8 text-blue-glow" />
              </div>
              <div>
                <p className="text-lg font-medium text-foreground">
                  Start a conversation
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Send a message to chat with the AI.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} />
          ))}

          {isLoading && (
            <div className="flex items-center gap-3 rounded-xl bg-blue-surface px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-blue-bright" />
              <span className="text-sm text-blue-bright">
                Streaming...
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Stop button */}
      {isLoading && (
        <div className="flex justify-center py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={stopGenerating}
            className="gap-2 border-border/50 text-muted-foreground hover:text-foreground"
          >
            <Square className="h-3 w-3 fill-current" />
            Stop generating
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="mx-auto w-full max-w-3xl">
        <ChatInput onSend={sendMessage} disabled={isLoading} />
      </div>
    </div>
  );
}