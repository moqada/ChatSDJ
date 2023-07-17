import { assertSpyCall, assertSpyCalls, spy } from "std/testing/mock.ts";
import { assertEquals } from "std/testing/asserts.ts";
import * as mf from "mock_fetch/mod.ts";
import { OpenAIAPIClient } from "./openai.ts";

mf.install();

const RESPONSE_FIRST = JSON.stringify({
  id: "chatcmpl-0",
  object: "chat.completion.chunk",
  created: 1689519400,
  model: "gpt-3.5-turbo-0613",
  choices: [{
    index: 0,
    delta: { role: "assistant", content: "" },
    finish_reason: null,
  }],
});
const RESPONSE_LAST = JSON.stringify({
  id: "chatcmpl-8888",
  object: "chat.completion.chunk",
  created: 1689519400,
  model: "gpt-3.5-turbo-0613",
  choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
});

const respondContent = (content: string) => {
  return JSON.stringify({
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    created: 1689519400,
    model: "gpt-3.5-turbo-0613",
    choices: [{
      index: 0,
      delta: { content },
      finish_reason: null,
    }],
  });
};

Deno.test("chatCompletions", async () => {
  mf.mock("POST@/v1/chat/completions", () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${RESPONSE_FIRST}`));
        // 53文字の文章を返す
        controller.enqueue(
          encoder.encode(`data: ${respondContent("こんにちは")}`),
        );
        controller.enqueue(encoder.encode(`data: ${respondContent("！")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("元")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("気")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("で")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("す")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("か")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("？")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("私")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("は")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("A")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("I")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("で")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("す")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("が")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("、")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("い")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("つ")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("も")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("楽")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("し")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("く")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("お")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("話")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("し")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("で")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("き")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("る")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("の")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("で")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("、")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("何")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("か")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("お")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("手")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("伝")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("い")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("で")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("き")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("る")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("こ")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("と")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("が")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("あ")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("り")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("ま")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("す")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("か")}`));
        controller.enqueue(encoder.encode(`data: ${respondContent("？")}`));
        controller.enqueue(encoder.encode(`data: ${RESPONSE_LAST}`));
        controller.enqueue(encoder.encode("data: [DONE]"));
        controller.close();
      },
    });
    return new Response(stream);
  });

  const onReceiveStreamingMessage: Parameters<
    OpenAIAPIClient["chatCompletions"]
  >[0]["onReceiveStreamingMessage"] = () => {};
  const spyOnReceiveStreamingMessage = spy(onReceiveStreamingMessage);
  const client = new OpenAIAPIClient("DUMMY_API_TOKEN");
  const res = await client.chatCompletions({
    messages: [{
      content:
        "あなたは人間ではありません。良い感じに80文字程度の文章で答えてください。",
      role: "system",
    }, {
      content: "こんにちは、こんにちは",
      role: "user",
    }],
    model: "gpt-3.5-turbo",
    onReceiveStreamingMessage: spyOnReceiveStreamingMessage,
  });

  assertEquals(res, { ok: true });
  assertSpyCall(spyOnReceiveStreamingMessage, 0, {
    args: [{
      isCompleted: false,
      message: "こんにちは！元気ですか？私はAIですが、いつも楽",
    }],
  });
  assertSpyCall(spyOnReceiveStreamingMessage, 1, {
    args: [{
      isCompleted: false,
      message:
        "こんにちは！元気ですか？私はAIですが、いつも楽しくお話しできるので、何かお手伝いできる",
    }],
  });
  assertSpyCall(spyOnReceiveStreamingMessage, 2, {
    args: [{
      isCompleted: true,
      message:
        "こんにちは！元気ですか？私はAIですが、いつも楽しくお話しできるので、何かお手伝いできることがありますか？",
    }],
  });
  assertSpyCalls(spyOnReceiveStreamingMessage, 3);
});
