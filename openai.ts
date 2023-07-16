export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class OpenAIAPIClient {
  constructor(private readonly apiKey: string) {}

  async chatCompletions(
    { messages, model = "gpt-3.5-turbo", onReceiveStreamingMessage }: {
      messages: ChatCompletionMessage[];
      model?: string;
      onReceiveStreamingMessage: (
        params: { message: string; isCompleted: boolean },
      ) => void;
    },
  ): Promise<{ ok: true } | { ok: false; error: unknown }> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 2048,
        stream: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        error: new Error(
          `OpenAI chat/completions failed (${res.status}): ${body}`,
        ),
      };
    }
    if (!res.body) {
      return {
        ok: false,
        error: new Error(
          `OpenAI chat/completions failed (${res.status}): NoBody`,
        ),
      };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let message = "";
    let done = false;
    let pendingWordCount = 0;
    while (!done) {
      const res = await reader.read();
      done = res.done;
      if (!res.value) {
        continue;
      }
      const lines = decoder.decode(res.value);
      const jsonLines = lines.split("data: ").map((line) => line.trim()).filter(
        (line) => line,
      );
      for (const json of jsonLines) {
        if (json === "[DONE]") {
          done = true;
          break;
        }
        const data = JSON.parse(json);
        const content = data.choices[0].delta.content || "";
        if (!content) {
          continue;
        }
        message += content;
        pendingWordCount += 1;
        if (pendingWordCount >= 20) {
          onReceiveStreamingMessage({ message, isCompleted: false });
          pendingWordCount = 0;
        }
      }
    }
    onReceiveStreamingMessage({ message, isCompleted: true });
    await reader.cancel();
    return { ok: true };
  }
}
