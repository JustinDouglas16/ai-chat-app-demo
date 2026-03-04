interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionStreamOptions {
  model: string;
  messages: ChatMessage[];
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta: {
      content: string;
    };
  }>;
}

export class InferenceClient {
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    if (!apiKey) {
      throw new Error("HF_TOKEN is required for Hugging Face InferenceClient");
    }

    this.apiKey = apiKey;
  }

  async *chatCompletionStream(
    options: ChatCompletionStreamOptions,
  ): AsyncGenerator<ChatCompletionChunk> {
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const errorBody = await response.text();
      throw new Error(`Hugging Face streaming request failed: ${response.status} ${errorBody}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const lines = event.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const content = parsed.choices?.[0]?.delta?.content ?? "";

            if (content) {
              yield {
                choices: [{ delta: { content } }],
              };
            }
          } catch {
            // ignore malformed chunk
          }
        }
      }
    }
  }
}