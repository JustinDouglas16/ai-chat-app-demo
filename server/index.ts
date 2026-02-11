import "dotenv/config";
import express from "express";
import cors from "cors";
import { OpenAI } from "openai";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const client = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: process.env.HF_TOKEN,
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    const completion = await client.chat.completions.create({
      model: "openai/gpt-oss-120b:groq",
      messages,
    });
    res.json(completion.choices[0].message);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Serve built frontend in production
app.use(express.static(path.join(__dirname, "../dist")));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

// old express v4
// app.get("*", (_req, res) => {
//   res.sendFile(path.join(__dirname, "../dist/index.html"));
// });

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});