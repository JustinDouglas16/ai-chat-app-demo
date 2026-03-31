import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import rateLimit from "express-rate-limit";
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
  "unasat.sr",
  "studie",
  "college",
  "faculteit",
  "administratie",
]);

const SCHOOL_ONLY_REFUSAL_MESSAGE =
  "Ik kan alleen vragen beantwoorden die over UNASAT of schoolzaken gaan. Stel je vraag opnieuw met UNASAT-context, bijvoorbeeld over opleidingen, inschrijving, rooster, locaties of contactinformatie.";

const SCHOOL_ONLY_SYSTEM_PROMPT =
  "Je bent een UNASAT-assistent. Beantwoord uitsluitend vragen die over UNASAT of schoolzaken gaan. Als een vraag niet over UNASAT/school gaat, weiger dan kort en verwijs de gebruiker om een UNASAT-gerelateerde vraag te stellen. Verzin geen feiten. Als informatie ontbreekt, zeg dat duidelijk en verwijs naar officiële UNASAT-kanalen.";

const MAX_QUESTIONS_PER_CONVERSATION = Number(
  process.env.MAX_QUESTIONS_PER_CONVERSATION ?? "3",
);

const RATE_LIMIT_REACHED_MESSAGE =
  "Je hebt het maximum aantal vragen voor deze chatsessie bereikt. Start een nieuw gesprek om verder te gaan.";

const hardcodedFacts: HardcodedFact[] = [
  {
    id: "unasat-location-paramaribo",
    triggers: [
      "waar is unasat paramaribo",
      "adres unasat paramaribo",
      "locatie unasat paramaribo",
      "waar bevindt unasat paramaribo zich",
      "unasat paramaribo adres",
    ],
    answer:
      "UNASAT Paramaribo bevindt zich aan Hindilaan 1B in Paramaribo. Je kunt contact opnemen via info@unasat.sr of bellen naar 430-490 / 438-718. WhatsApp berichten kunnen naar 888-2543.",
  },
  {
    id: "unasat-location-nickerie",
    triggers: [
      "waar is unasat nickerie",
      "adres unasat nickerie",
      "locatie unasat nickerie",
      "waar bevindt unasat nickerie zich",
      "unasat nickerie adres",
    ],
    answer:
      "UNASAT Nickerie bevindt zich aan Walther Hewittstraat 1, Wingroep, Nieuw Nickerie. Je kunt contact opnemen via someopleidingscoordinator@unasat.sr of bellen naar 430-490 / 438-718. WhatsApp berichten kunnen naar 888-2543.",
  },
  {
    id: "unasat-contact",
    triggers: [
      "contact unasat",
      "telefoon unasat",
      "email unasat",
      "hoe kan ik unasat bereiken",
      "unasat telefoonnummer",
    ],
    answer:
      "Je kunt UNASAT bereiken via e-mail op info@unasat.sr of telefonisch via 430-490 / 438-718. Voor WhatsApp berichten kun je sturen naar 888-2543.",
  },
  {
    id: "unasat-whatsapp",
    triggers: [
      "unasat whatsapp",
      "kan ik unasat appen",
      "whatsapp nummer unasat",
      "unasat mobiel nummer",
    ],
    answer:
      "Je kunt UNASAT een WhatsApp bericht sturen naar 888-2543. Dit nummer is alleen bedoeld voor WhatsApp berichten.",
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

    const conversationMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    const userQuestionCount = conversationMessages.filter(
      (message) => message.role === "user",
    ).length;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

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

    const streamLiteralResponse = async (content: string) => {
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
      await persistAssistantAndClose(content);
    };

    const streamModelResponse = async (
      upstreamMessages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }>,
      fallbackResponse?: string,
    ) => {
      try {
        const stream = client.chatCompletionStream({
          model: "openai/gpt-oss-120b:groq",
          messages: upstreamMessages,
        });

        let assistantContent = "";

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";

          if (content) {
            assistantContent += content;
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }

        if (!assistantContent.trim() && fallbackResponse) {
          await streamLiteralResponse(fallbackResponse);
          return;
        }

        await persistAssistantAndClose(assistantContent);
      } catch (streamError) {
        console.error(
          "Model stream failed, using fallback response",
          streamError,
        );

        if (fallbackResponse) {
          await streamLiteralResponse(fallbackResponse);
          return;
        }

        throw streamError;
      }
    };

    if (userQuestionCount >= MAX_QUESTIONS_PER_CONVERSATION) {
      await streamLiteralResponse(RATE_LIMIT_REACHED_MESSAGE);
      return;
    }

    // Save user message
    await db.insert(messages).values({
      id: uuidv4(),
      conversationId,
      role: userMsg.role,
      content: userMsg.content,
    });

    // Update conversation title from first user message
    if (conversationMessages.length === 0) {
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

    if (!isSchoolQuestion && !ragMatch) {
      await streamLiteralResponse(SCHOOL_ONLY_REFUSAL_MESSAGE);
      return;
    }

    if (hardcodedFactMatch) {
      await streamModelResponse(
        [
          {
            role: "system",
            content: `${SCHOOL_ONLY_SYSTEM_PROMPT} Herschrijf het antwoord duidelijker en natuurlijker, maar behoud alle feiten exact. Voeg geen nieuwe details toe.`,
          },
          {
            role: "user",
            content: `Vraag van gebruiker: ${userMsg.content}\n\nBronantwoord (feitelijk): ${hardcodedFactMatch.answer}\n\nGeef een beter geformuleerd antwoord in dezelfde taal als de gebruiker.`,
          },
        ],
        hardcodedFactMatch.answer,
      );
      return;
    }

    if (isSchoolQuestion && !ragMatch) {
      const safeFallback =
        "Ik wil je geen foutieve schoolinformatie geven. Ik heb hiervoor geen geverifieerde UNASAT-bron in mijn kennisset. Controleer dit via de officiële UNASAT-kanalen of de administratie.";
      await streamLiteralResponse(safeFallback);
      return;
    }

    const upstreamMessages = ragMatch
      ? [
          {
            role: "system" as const,
            content: SCHOOL_ONLY_SYSTEM_PROMPT,
          },
          {
            role: "system" as const,
            content:
              "Gebruik uitsluitend de meegeleverde kennis als primaire bron. Als de kennis niet voldoende is, zeg dat expliciet en verwijs naar officiële UNASAT-kanalen.",
          },
          ...chatMessages.slice(0, -1),
          {
            role: "user" as const,
            content: `${userMsg.content}\n\nGebruik deze kennis als context:\nVraag: ${ragMatch.question}\nAntwoord: ${ragMatch.answer}\n\nGeef een duidelijk, kort antwoord in dezelfde taal als de gebruiker en blijf binnen deze kennis.`,
          },
        ]
      : [
          {
            role: "system" as const,
            content: SCHOOL_ONLY_SYSTEM_PROMPT,
          },
          ...chatMessages,
        ];
    await streamModelResponse(upstreamMessages);
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
// app.use(express.static(path.join(__dirname, "../dist")));
// app.get("/{*splat}", (_req, res) => {
//   res.sendFile(path.join(__dirname, "../dist/index.html"));
// });

const distDir = path.join(__dirname, "../dist");

const staticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

app.use(
  "/",
  staticLimiter,
  express.static(distDir, {
    index: false,
  }),
);

app.get("/{*splat}", staticLimiter, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
