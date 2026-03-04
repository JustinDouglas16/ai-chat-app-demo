import "dotenv/config";
import express from "express";
import cors from "cors";
// import { OpenAI } from "openai";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { eq, desc, asc } from "drizzle-orm";
import { readFileSync } from "fs";
import { db } from "./db/index.js";
import { conversations, messages } from "./db/schema.js";
import { InferenceClient } from "@huggingface/inference";

interface RagEntry {
  id: string;
  question: string;
  answer: string;
  combined_text?: string;
  metadata?: Record<string, unknown>;
}

interface IndexedRagEntry extends RagEntry {
  searchableText: string;
  tokens: string[];
}

interface HardcodedFact {
  id: string;
  triggers: string[];
  answer: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// const client = new OpenAI({
//   baseURL: "https://router.huggingface.co/v1",
//   apiKey: process.env.HF_TOKEN,
// });

const client = new InferenceClient(process.env.HF_TOKEN);

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (text: string) =>
  normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 2);

const schoolDomainKeywords = new Set([
  "unasat",
  "school",
  "campus",
  "locatie",
  "adres",
  "lokaal",
  "les",
  "rooster",
  "docent",
  "inschrijven",
  "opleiding",
  "student",
  "sharepoint",
]);

const hardcodedFacts: HardcodedFact[] = [
  {
    id: "unasat-location-verification",
    triggers: [
      "waar is unasat",
      "waar bevindt unasat zich",
      "wat is het adres van unasat",
      "unasat adres",
      "locatie unasat",
    ],
    answer:
      "Ik kan je locatievraag alleen beantwoorden op basis van geverifieerde UNASAT-bronnen. In mijn huidige kennisset staat nog geen officieel, bevestigd adresrecord. Raadpleeg daarom de officiële UNASAT-website of administratie voor het juiste adres.",
  },
  {
    id: "unasat-classroom",
    triggers: ["in welk lokaal", "welk lokaal", "waar is mijn lokaal"],
    answer:
      "Volgens de UNASAT-kennisset staat het lokaal op het informatiebord bij de grote ingang en in je rooster op SharePoint.",
  },
];

function isSchoolDomainQuestion(question: string): boolean {
  const normalizedQuestion = normalizeText(question);

  return Array.from(schoolDomainKeywords).some((keyword) =>
    normalizedQuestion.includes(keyword),
  );
}

function findHardcodedFactMatch(question: string): HardcodedFact | null {
  const normalizedQuestion = normalizeText(question);

  for (const fact of hardcodedFacts) {
    const found = fact.triggers.some((trigger) =>
      normalizedQuestion.includes(normalizeText(trigger)),
    );

    if (found) {
      return fact;
    }
  }

  return null;
}

function loadRagEntries(): IndexedRagEntry[] {
  const ragPath = path.join(__dirname, "data", "unasat_rag.json");

  try {
    const raw = readFileSync(ragPath, "utf-8");
    const parsed = JSON.parse(raw) as RagEntry[];

    return parsed.map((entry) => {
      const searchableText = `${entry.question} ${entry.answer} ${entry.combined_text ?? ""}`;
      return {
        ...entry,
        searchableText,
        tokens: tokenize(searchableText),
      };
    });
  } catch (error) {
    console.error("Failed to load RAG dataset from", ragPath, error);
    return [];
  }
}

const ragEntries = loadRagEntries();

function findBestRagMatch(question: string): IndexedRagEntry | null {
  if (ragEntries.length === 0) return null;

  const normalizedQuery = normalizeText(question);
  const queryTokens = tokenize(question);

  if (queryTokens.length === 0) return null;

  let best: { entry: IndexedRagEntry; score: number; overlap: number } | null =
    null;

  for (const entry of ragEntries) {
    const directQuestionMatch = normalizeText(entry.question).includes(
      normalizedQuery,
    )
      ? 1
      : 0;
    const queryInEntry = entry.searchableText
      ? Number(normalizeText(entry.searchableText).includes(normalizedQuery))
      : 0;

    const entryTokenSet = new Set(entry.tokens);
    let overlap = 0;

    for (const token of queryTokens) {
      if (entryTokenSet.has(token)) {
        overlap += 1;
      }
    }

    const overlapRatio = overlap / queryTokens.length;
    const score = Math.max(
      directQuestionMatch,
      queryInEntry * 0.95,
      overlapRatio,
    );

    if (!best || score > best.score) {
      best = { entry, score, overlap };
    }
  }

  if (!best) return null;

  const hasEnoughOverlap = best.overlap >= 2;
  const strongScore = best.score >= 0.55;

  if (!hasEnoughOverlap && !strongScore) {
    return null;
  }

  return best.entry;
}

// --- Conversation routes ---
// List all conversations
app.get("/api/conversations", async (_req, res) => {
  try {
    const result = await db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.updatedAt));
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Create a new conversation
app.post("/api/conversations", async (_req, res) => {
  try {
    const id = uuidv4();
    const now = new Date();
    await db.insert(conversations).values({
      id,
      title: "New Chat",
      createdAt: now,
      updatedAt: now,
    });
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    res.json(conversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Delete a conversation
app.delete("/api/conversations/:id", async (req, res) => {
  try {
    await db.delete(conversations).where(eq(conversations.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

// Get messages for a conversation
app.get("/api/conversations/:id/messages", async (req, res) => {
  try {
    const result = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, req.params.id))
      .orderBy(asc(messages.createdAt));
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// --- Chat route with streaming ---

app.post("/api/chat", async (req, res) => {
  try {
    const { messages: chatMessages, conversationId } = req.body;

    // Save user message
    const userMsg = chatMessages[chatMessages.length - 1];
    await db.insert(messages).values({
      id: uuidv4(),
      conversationId,
      role: userMsg.role,
      content: userMsg.content,
    });

    // Update conversation title from first user message
    const msgCount = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    if (msgCount.length === 1) {
      const title =
        userMsg.content.length > 50
          ? userMsg.content.slice(0, 50) + "..."
          : userMsg.content;
      await db
        .update(conversations)
        .set({ title, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    }

    const ragMatch = findBestRagMatch(userMsg.content);
    const hardcodedFactMatch = findHardcodedFactMatch(userMsg.content);
    const isSchoolQuestion = isSchoolDomainQuestion(userMsg.content);

    const persistAssistantAndClose = async (assistantContent: string) => {
      await db.insert(messages).values({
        id: uuidv4(),
        conversationId,
        role: "assistant",
        content: assistantContent,
      });

      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      res.write("data: [DONE]\n\n");
      res.end();
    };

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (hardcodedFactMatch) {
      const safeAnswer = hardcodedFactMatch.answer;
      res.write(`data: ${JSON.stringify({ content: safeAnswer })}\n\n`);
      await persistAssistantAndClose(safeAnswer);
      return;
    }

    if (isSchoolQuestion && !ragMatch) {
      const safeFallback =
        "Ik wil je geen foutieve schoolinformatie geven. Ik heb hiervoor geen geverifieerde UNASAT-bron in mijn kennisset. Controleer dit via de officiële UNASAT-kanalen of de administratie.";
      res.write(`data: ${JSON.stringify({ content: safeFallback })}\n\n`);
      await persistAssistantAndClose(safeFallback);
      return;
    }

    const upstreamMessages = ragMatch
      ? [
          {
            role: "system" as const,
            content:
              "Je bent een behulpzame UNASAT-assistent. Gebruik uitsluitend de meegeleverde kennis als primaire bron. Als de kennis niet voldoende is, zeg dat expliciet en verwijs naar officiële UNASAT-kanalen.",
          },
          ...chatMessages.slice(0, -1),
          {
            role: "user" as const,
            content: `${userMsg.content}\n\nGebruik deze kennis als context:\nVraag: ${ragMatch.question}\nAntwoord: ${ragMatch.answer}\n\nGeef een duidelijk, kort antwoord in dezelfde taal als de gebruiker en blijf binnen deze kennis.`,
          },
        ]
      : chatMessages;

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // const stream = await client.chat.completions.create({
    //   model: "moonshotai/Kimi-K2-Instruct-0905:fastest",
    //   messages: upstreamMessages,
    //   stream: true,
    // });

    const stream = client.chatCompletionStream({
      model: "openai/gpt-oss-120b:groq",
      messages: upstreamMessages,
      // stream: true,
    });

    let assistantContent = "";

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        assistantContent += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    await persistAssistantAndClose(assistantContent);

    // Save assistant message
    // await db.insert(messages).values({
    //   id: uuidv4(),
    //   conversationId,
    //   role: "assistant",
    //   content: assistantContent,
    // });

    // Update conversation timestamp
    // await db
    //   .update(conversations)
    //   .set({ updatedAt: new Date() })
    //   .where(eq(conversations.id, conversationId));

    // res.write("data: [DONE]\n\n");
    // res.end();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Something went wrong" });
    } else {
      res.write(
        `data: ${JSON.stringify({ error: "Something went wrong" })}\n\n`,
      );
      res.end();
    }
  }
});

// Serve built frontend in production
app.use(express.static(path.join(__dirname, "../dist")));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
