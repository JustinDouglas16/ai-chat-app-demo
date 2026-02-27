import { useEffect } from "react";
import { ChatContainer } from "@/components/chat/ChatContainer";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { useConversations } from "@/hooks/useConversations";

function App() {
  const {
    conversations,
    activeId,
    setActiveId,
    fetchConversations,
    createConversation,
    deleteConversation,
  } = useConversations();

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleSelect = (id: string) => {
    setActiveId(id);
  };

  const handleCreate = async () => {
    const newConversationId =  await createConversation();
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
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onDelete={handleDelete}
      />
      <ChatContainer
        conversationId={activeId}
        onFirstMessage={handleCreate}
      />
    </div>
  );
}

export default App;