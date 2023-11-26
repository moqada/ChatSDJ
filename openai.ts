export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ListModelsResponse = {
  data: Array<{
    id: string;
    object: string;
    owned_by: string;
    permission: unknown[];
  }>;
  object: "list";
};

type GenerateImageResponse = {
  data: Array<{
    b64_json: string;
    revised_prompt: string;
  }>;
};

type ChatCompletionTool = {
  type: "function";
  function: {
    description?: string;
    name: string;
    // parameters are json schema
    parameters: {
      type: "object";
      properties: Record<string, {
        type: string;
        // deno-lint-ignore no-explicit-any
        [key: string]: any;
      }>;
      required: string[];
    };
  };
};

export class OpenAIAPIClient {
  constructor(private readonly apiKey: string) {}

  async listModels(): Promise<
    { ok: true; data: ListModelsResponse } | { ok: false; error: unknown }
  > {
    const res = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        error: new Error(
          `OpenAI models failed (${res.status}): ${body}`,
        ),
      };
    }
    const data = await res.json() as ListModelsResponse;
    return { ok: true, data };
  }

  async chatCompletions(
    { messages, model, onReceiveStreamingResponse, tools }: {
      messages: ChatCompletionMessage[];
      model: string;
      onReceiveStreamingResponse: (
        params: { message: string; isCompleted: boolean } | {
          tool: {
            name: string;
            // deno-lint-ignore no-explicit-any
            arguments: Record<string, any>;
          };
          isCompleted: true;
        },
      ) => void;
      tools?: ChatCompletionTool[];
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
        tools,
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
    let functionCalling: { name: string; arguments: string } | undefined;
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
        // 通常のテキスト返信の場合は、20文字毎に onReceiveStreamingResponse を呼び出す。
        // function calling の場合は、全て受信し切ったあとに1回だけ onReceiveStreamingResponse を呼び出す
        if ("tool_calls" in data.choices[0].delta) {
          const func = data.choices[0].delta.tool_calls[0].function;
          functionCalling = functionCalling
            ? {
              ...functionCalling,
              arguments: functionCalling.arguments + func.arguments,
            }
            : func;
        } else {
          const content = data.choices[0].delta.content || "";
          if (!content) {
            continue;
          }
          message += content;
          pendingWordCount += 1;
          if (pendingWordCount >= 20) {
            onReceiveStreamingResponse({ message, isCompleted: false });
            pendingWordCount = 0;
          }
        }
      }
    }
    if (functionCalling) {
      onReceiveStreamingResponse({
        tool: {
          ...functionCalling,
          arguments: JSON.parse(functionCalling.arguments),
        },
        isCompleted: true,
      });
    } else {
      onReceiveStreamingResponse({ message, isCompleted: true });
    }
    await reader.cancel();
    return { ok: true };
  }

  async generateImage(
    { model, prompt }: {
      prompt: string;
      model: string;
    },
  ): Promise<
    { ok: true; data: GenerateImageResponse } | { ok: false; error: unknown }
  > {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        model,
        n: 1,
        response_format: "b64_json",
        size: "1024x1024",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        error: new Error(
          `OpenAI models failed (${res.status}): ${body}`,
        ),
      };
    }
    const data = await res.json() as GenerateImageResponse;
    return { ok: true, data };
  }
}
