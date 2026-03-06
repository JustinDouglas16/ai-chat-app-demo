# UNASAT AI Chat Application - Codebase Documentation

## 1. Project Overview
This project is a full-stack AI chat application designed to answer student questions about **UNASAT** (University of Applied Sciences and Technology). It uses **Retrieval-Augmented Generation (RAG)** to provide accurate, context-aware answers based on a predefined knowledge base of approximately 134 Q&A pairs.

## 2. Tech Stack

### Frontend
- **Framework**: React 19 (via Vite)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (v4)
- **Icons**: Lucide React
- **HTTP Client**: Native `fetch` with `EventSource` handling for streaming.

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database ORM**: Drizzle ORM
- **Database**: PostgreSQL (connected via `pg` driver)
- **AI/ML**: Hugging Face Inference API (accessing `openai/gpt-oss-120b:groq`)

---

## 3. Directory Structure & Key Files

### Backend (`/server`)

| File/Directory | Description |
| :--- | :--- |
| **`server/index.ts`** | **The Core Backend Logic.** Entry point for the Express server. Handles all API routes (`/api/chat`, `/api/conversations`), implements the RAG search logic, and manages the SSE (Server-Sent Events) streaming response. |
| **`server/lib/hfInferenceClient.ts`** | A custom wrapper class (`InferenceClient`) for the Hugging Face API. It mimics the OpenAI API structure to handle streaming chat completions. |
| **`server/db/schema.ts`** | Defines the database schema using Drizzle ORM. Contains tables for `conversations` and `messages`. |
| **`server/db/index.ts`** | Initializes the database connection using `node-postgres` and exports the Drizzle `db` instance. |
| **`server/data/unasat_rag.json`** | **The Knowledge Base.** A JSON file containing specific UNASAT information (e.g., "Where is the campus?", "How to enroll?"). This data is loaded into memory and searched when a user asks a question. |

### Frontend (`/src`)

| File/Directory | Description |
| :--- | :--- |
| **`src/App.tsx`** | The main layout component. Manages the split-screen layout between the `ChatSidebar` and `ChatContainer`. |
| **`src/hooks/useChat.ts`** | **Core Frontend Logic.** A custom React hook that manages chat state (messages, loading), handles sending messages to the backend, and processes the incoming SSE stream to display text character-by-character. |
| **`src/hooks/useConversations.ts`** | Manages the list of chat sessions (create, delete, select active chat). |
| **`src/components/chat/`** | UI Components for the chat interface: <br> - `ChatContainer.tsx`: The main message view. <br> - `ChatInput.tsx`: The text input area. <br> - `ChatSidebar.tsx`: The history sidebar. |

---

## 4. Detailed Component Analysis

### A. The "Brain": `server/index.ts`
This file orchestrates the entire AI response process.

**Key Functions:**
1.  **`loadRagEntries()`**: Reads `unasat_rag.json` at startup and prepares it for searching.
2.  **`findBestRagMatch(question)`**: A custom search algorithm.
    *   It tokenizes the user's input.
    *   It compares tokens against the "knowledge base" questions and answers.
    *   It calculates a score based on keyword overlap.
    *   **Purpose**: To find the most relevant UNASAT fact to include in the prompt.
3.  **`POST /api/chat`**:
    *   Receives the user's message.
    *   **Step 1: Hardcoded Check**: Checks if the question matches a static list of "Hardcoded Facts" (e.g., specific addresses/phone numbers) for instant, perfect accuracy.
    *   **Step 2: Domain Check**: Checks `isSchoolDomainQuestion` to see if the user is asking about the school.
    *   **Step 3: RAG Search**: Uses `findBestRagMatch` to retrieve context.
    *   **Step 4: AI Generation**: Constructs a prompt like:
        > "You are a UNASAT assistant... Use this context: [Retrieved Fact]... Question: [User Query]"
    *   **Step 5: Streaming**: Streams the response back to the client using Server-Sent Events (SSE).

### B. The AI Client: `server/lib/hfInferenceClient.ts`
Instead of using the standard OpenAI SDK, this project implements a lightweight custom class.
*   **Why?** likely to have fine-grained control over the Hugging Face API headers and streaming format.
*   **Functionality**: It sends a POST request to `https://router.huggingface.co/v1/chat/completions` and yields chunks of text as they arrive.

### C. The Frontend Hook: `src/hooks/useChat.ts`
This hook bridges the UI and the Backend.
*   **`sendMessage`**:
    *   Optimistically updates the UI with the user's message.
    *   Opens a connection to `/api/chat`.
    *   Uses a `TextDecoder` to read the binary stream.
    *   Parses lines starting with `data:` (SSE format).
    *   Appends each new text chunk to the `assistantContent` state, creating the "typing" effect.

---

## 5. Data Flow Example
**Scenario**: User asks *"Where is the campus?"*

1.  **Frontend**: `useChat` sends `"Where is the campus?"` to `POST /api/chat`.
2.  **Backend (Search)**:
    *   `findBestRagMatch` scans `unasat_rag.json`.
    *   It finds entry `unasat_010`: "De hoofdvestiging is aan de Hindilaan 5...".
3.  **Backend (Prompting)**:
    *   It creates a system message: *"Use this context: De hoofdvestiging is aan de Hindilaan 5..."*
4.  **Backend (Inference)**:
    *   Sends this prompt to Hugging Face API.
5.  **Backend (Streaming)**:
    *   Receives "The ", "campus ", "is ", "at..." chunks.
    *   Forwards them to the Frontend via SSE.
6.  **Frontend**:
    *   Updates the last message in real-time as chunks arrive.
