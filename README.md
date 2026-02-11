# React chat app

A chat interface powered by Hugging Face's API router, built with React, TypeScript, shadcn/ui, Tailwind CSS v4, and Express.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4)

## Features

- 💬 Real-time chat with AI models via Hugging Face
- 🎨 Clean dark UI with shadcn/ui components
- 📝 Markdown rendering (tables, code blocks, bold, etc.)
- ⌨️ Send with Enter, new line with Shift+Enter
- 🔒 API key stays secure on the server
- 🧹 Clear conversation history

## Tech Stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Frontend | React 19 + TypeScript + Vite        |
| UI       | shadcn/ui + Tailwind CSS v4         |
| Markdown | react-markdown + remark-gfm         |
| Backend  | Express 5                           |
| AI       | OpenAI SDK → Hugging Face Router    |
| Icons    | Lucide React                        |

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or higher
- A [Hugging Face](https://huggingface.co/settings/tokens) API token

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/JustinDouglas16/react-chat-app.git
cd react-chat-app
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env` file in the root directory:

```text
HF_TOKEN=hf_your_token_here
```

### 4. Start the development server

```bash
npm run dev
```

This starts both the Vite dev server (port 5173) and the Express API
(port 3001) concurrently.

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Production build

```bash
npm run build
npm start
```

This builds the React frontend into `dist/` and starts the Express
server which serves both the API and the static files.

## Project Structure

```text
hf-chat/
├── public/
├── server/
│   └── index.ts              # Express API server
├── src/
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatContainer.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   └── ChatMessage.tsx
│   │   └── ui/               # shadcn/ui components
│   ├── hooks/
│   │   └── useChat.ts        # Chat state management
│   ├── lib/
│   │   ├── types.ts
│   │   └── utils.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── .env                       # API keys (not committed)
├── .gitignore
├── components.json            # shadcn config
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Available Scripts

| Command         | Description                                  |
| --------------- | -------------------------------------------- |
| `npm run dev`   | Start both frontend and backend in dev mode  |
| `npm run build` | Build the frontend for production            |
| `npm start`     | Start the production server                  |
| `npm run lint`  | Run ESLint                                   |

## Changing the Model

To use a different model, update the `model` field in
`server/index.ts`:

```ts
const completion = await client.chat.completions.create({
  model: "openai/gpt-oss-120b:groq", // Change this
  messages,
});
```

Browse available models at
[huggingface.co/models](https://huggingface.co/models).

## License

MIT
