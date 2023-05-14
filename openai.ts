const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-3.5-turbo";

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const chatCompletions = async (
  { messages, onReceiveStreamingMessage }: {
    messages: ChatCompletionMessage[];
    onReceiveStreamingMessage: (
      params: { message: string; isCompleted: boolean },
    ) => void;
  },
): Promise<{ ok: true } | { ok: false; error: unknown }> => {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
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
};
