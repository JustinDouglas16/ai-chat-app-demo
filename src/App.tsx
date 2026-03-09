import { useEffect, useState } from "react";
import { ChatContainer } from "@/components/chat/ChatContainer";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { useConversations } from "@/hooks/useConversations";
import { Sheet, SheetContent } from "@/components/ui/sheet";

function App() {
  const {
    conversations,
    activeId,
    setActiveId,
    fetchConversations,
    createConversation,
    deleteConversation,
  } = useConversations();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleSelect = (id: string) => {
    setActiveId(id);
  };

  const handleCreate = async () => {
    const newConversationId = await createConversation();
    // Refresh list to get updated data
    await fetchConversations();
    return newConversationId;
  };

  const handleDelete = async (id: string) => {
    await deleteConversation(id);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <ChatSidebar
        className="hidden md:flex"
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onDelete={handleDelete}
      />
      <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SheetContent
          side="left"
          className="w-[85vw] p-0 sm:max-w-xs"
          showCloseButton={false}
        >
          <ChatSidebar
            className="w-full border-r-0"
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelect}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onAction={() => setIsSidebarOpen(false)}
          />
        </SheetContent>
      </Sheet>
      <ChatContainer
        conversationId={activeId}
        onFirstMessage={handleCreate}
        onOpenSidebar={() => setIsSidebarOpen(true)}
      />
    </div>
  );
}

export default App;
