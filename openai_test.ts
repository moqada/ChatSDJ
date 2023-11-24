import { assertSpyCall, assertSpyCalls, spy } from "std/testing/mock.ts";
import { assertEquals } from "std/testing/asserts.ts";
import * as mf from "mock_fetch/mod.ts";
import { OpenAIAPIClient } from "./openai.ts";

mf.install();

Deno.test("chatCompletions - simple message response", async () => {
  const responseFirst = JSON.stringify({
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
  const responseLast = JSON.stringify({
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
  mf.mock("POST@/v1/chat/completions", () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${responseFirst}`));
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
        controller.enqueue(encoder.encode(`data: ${responseLast}`));
        controller.enqueue(encoder.encode("data: [DONE]"));
        controller.close();
      },
    });
    return new Response(stream);
  });

  const onReceiveStreamingResponse: Parameters<
    OpenAIAPIClient["chatCompletions"]
  >[0]["onReceiveStreamingResponse"] = () => {};
  const spyOnReceiveStreamingResponse = spy(onReceiveStreamingResponse);
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
    onReceiveStreamingResponse: spyOnReceiveStreamingResponse,
  });

  assertEquals(res, { ok: true });
  assertSpyCall(spyOnReceiveStreamingResponse, 0, {
    args: [{
      isCompleted: false,
      message: "こんにちは！元気ですか？私はAIですが、いつも楽",
    }],
  });
  assertSpyCall(spyOnReceiveStreamingResponse, 1, {
    args: [{
      isCompleted: false,
      message:
        "こんにちは！元気ですか？私はAIですが、いつも楽しくお話しできるので、何かお手伝いできる",
    }],
  });
  assertSpyCall(spyOnReceiveStreamingResponse, 2, {
    args: [{
      isCompleted: true,
      message:
        "こんにちは！元気ですか？私はAIですが、いつも楽しくお話しできるので、何かお手伝いできることがありますか？",
    }],
  });
  assertSpyCalls(spyOnReceiveStreamingResponse, 3);
});

Deno.test("chatCompletions - function calling response", async () => {
  const responseFirst = JSON.stringify({
    id: "chatcmpl-0",
    object: "chat.completion.chunk",
    created: 1689519400,
    model: "gpt-3.5-turbo-0613",
    choices: [{
      index: 0,
      delta: {
        role: "assistant",
        content: null,
        tool_calls: [{
          index: 0,
          id: "call_dummy_id",
          type: "function",
          function: { name: "generate_image", arguments: "" },
        }],
      },
    }],
  });
  const responseLast = JSON.stringify({
    id: "chatcmpl-8888",
    object: "chat.completion.chunk",
    created: 1689519400,
    model: "gpt-3.5-turbo-0613",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  });
  const respondArg = (arg: string) => {
    return JSON.stringify({
      id: "chatcmpl-1",
      object: "chat.completion.chunk",
      created: 1689519400,
      model: "gpt-3.5-turbo-0613",
      choices: [{
        index: 0,
        delta: { tool_calls: [{ index: 0, function: { arguments: arg } }] },
        finish_reason: null,
      }],
    });
  };
  mf.mock("POST@/v1/chat/completions", () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${responseFirst}`));
        controller.enqueue(
          encoder.encode(`data: ${respondArg("{\n")}`),
        );
        controller.enqueue(encoder.encode(`data: ${respondArg(" ")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg(' "')}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("prompt")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg('":')}`));
        controller.enqueue(encoder.encode(`data: ${respondArg(' "')}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("カ")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("イ")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("ジ")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("の")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("タ")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("ッ")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("チ")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("で")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("、")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("命")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("を")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("燃")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("や")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("し")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("抗")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("争")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("する")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("豚")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("の")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("角")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("煮")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("と")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("サ")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("バ")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("の")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("味")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("噌")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("煮")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("の")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("バ")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("ト")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("ル")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("シ")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("ー")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("ン")}`));
        controller.enqueue(encoder.encode(`data: ${respondArg('"\n')}`));
        controller.enqueue(encoder.encode(`data: ${respondArg("}")}`));
        controller.enqueue(encoder.encode(`data: ${responseLast}`));
        controller.enqueue(encoder.encode("data: [DONE]"));
        controller.close();
      },
    });
    return new Response(stream);
  });

  const onReceiveStreamingResponse: Parameters<
    OpenAIAPIClient["chatCompletions"]
  >[0]["onReceiveStreamingResponse"] = () => {};
  const spyOnReceiveStreamingResponse = spy(onReceiveStreamingResponse);
  const client = new OpenAIAPIClient("DUMMY_API_TOKEN");
  const res = await client.chatCompletions({
    messages: [{
      content: "あなたは人間ではありません。良い感じに答えてください。",
      role: "system",
    }, {
      content:
        "カイジの漫画のタッチで、命を燃やし抗争する豚の角煮とサバの味噌煮のバトルシーンの画像をください",
      role: "user",
    }],
    model: "gpt-3.5-turbo",
    onReceiveStreamingResponse: spyOnReceiveStreamingResponse,
  });

  assertEquals(res, { ok: true });
  assertSpyCall(spyOnReceiveStreamingResponse, 0, {
    args: [{
      isCompleted: true,
      tool: {
        name: "generate_image",
        arguments: {
          prompt:
            "カイジのタッチで、命を燃やし抗争する豚の角煮とサバの味噌煮のバトルシーン",
        },
      },
    }],
  });
  assertSpyCalls(spyOnReceiveStreamingResponse, 1);
});

Deno.test("generateImage", async () => {
  const dummyBody = {
    created: 1629876543,
    data: [{
      b64_json: "RFVNTVlfSU1BR0U=", // base64 encoded "DUMMY_IMAGE"
      revised_prompt: "",
    }],
  };
  const imageGenerationsCalls: Record<string, unknown>[] = [];
  mf.mock("POST@/v1/images/generations", async (req) => {
    const params = await req.clone().json();
    imageGenerationsCalls.push(params);
    return new Response(JSON.stringify(dummyBody));
  });
  const client = new OpenAIAPIClient("DUMMY_API_TOKEN");

  const res = await client.generateImage({
    model: "dall-e-3",
    prompt: "素晴しい景色",
  });

  assertEquals(res, {
    ok: true,
    data: dummyBody,
  });
  assertEquals(imageGenerationsCalls, [{
    model: "dall-e-3",
    n: 1,
    prompt: "素晴しい景色",
    response_format: "b64_json",
    size: "1024x1024",
  }]);
});
