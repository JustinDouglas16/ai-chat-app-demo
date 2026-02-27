import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import type { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: ChatSidebarProps) {
  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-border/50 bg-card/50">
      {/* New chat button */}
      <div className="p-3">
        <Button
          onClick={onCreate}
          className="w-full gap-2 bg-blue-glow text-white hover:bg-blue-bright"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <Separator className="bg-border/50" />

      {/* Conversation list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {conversations.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No conversations yet
          </p>
        )}

        <TooltipProvider delayDuration={300}>
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "group flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors cursor-pointer",
                activeId === conv.id
                  ? "bg-blue-glow/15 text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
              onClick={() => onSelect(conv.id)}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{conv.title}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(conv.id);
                    }}
                    className="hidden shrink-0 rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Delete</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </TooltipProvider>
      </div>
    </div>
  );
}