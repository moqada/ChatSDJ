import * as mf from "mock_fetch/mod.ts";
import { assertEquals } from "std/testing/asserts.ts";
import { assertSpyCalls, stub } from "std/testing/mock.ts";
import { talk } from "./counsellor.ts";
import { OpenAIAPIClient } from "./openai.ts";
import { createSlackEventContext, SlackEventContext } from "./slack.ts";

mf.install();

const setup = (slackEvent: SlackEventContext["event"]) => {
  const messageTs = "BOT_MESSAGE_TS";
  const botUserId = "BOT_USER_ID";

  const chatPostMessageCalls: Record<string, unknown>[] = [];
  const chatUpdateCalls: Record<string, unknown>[] = [];
  mf.mock("POST@/api/chat.postMessage", async (req) => {
    const formData = await req.clone().formData();
    const params: Record<string, unknown> = {};
    formData.forEach((value, key) => {
      params[key] = value;
    });
    chatPostMessageCalls.push(params);
    return new Response(
      JSON.stringify({
        ok: true,
        channel: slackEvent.channel,
        ts: messageTs,
        message: {
          text: params["text"],
        },
      }),
    );
  });
  mf.mock("POST@/api/chat.update", async (req) => {
    const formData = await req.clone().formData();
    const params: Record<string, unknown> = {};
    formData.forEach((value, key) => {
      params[key] = value;
    });
    chatUpdateCalls.push(params);
    return new Response(
      JSON.stringify({
        ok: true,
        channel: slackEvent.channel,
        ts: Date.now().toString(),
        message: {
          text: params["text"],
        },
      }),
    );
  });

  const slackEventContext = createSlackEventContext({
    apiToken: "DUMMY_API_KEY",
    payload: {
      authorizations: [{ user_id: botUserId }],
      event: slackEvent,
    },
  });

  return {
    botUserId,
    messageTs,
    chatPostMessageCalls,
    chatUpdateCalls,
    slackEventContext,
  };
};

Deno.test("talk() - outside of the thread", async () => {
  const channelId = "DUMMY_CHANNEL_ID";
  const originalMessage = "こんにちは!";
  const originalMessageTs = "ORIGINAL_MESSAGE_TS";
  const {
    messageTs,
    chatPostMessageCalls,
    chatUpdateCalls,
    slackEventContext,
  } = setup({
    channel: channelId,
    text: originalMessage,
    ts: originalMessageTs,
  });

  const openAIAPIClient = new OpenAIAPIClient("DUMMY_API_KEY");
  const stubChatCompletions = stub(
    openAIAPIClient,
    "chatCompletions",
    async ({ onReceiveStreamingMessage }) => {
      await onReceiveStreamingMessage({
        message: "Yes!",
        isCompleted: false,
      });
      await onReceiveStreamingMessage({
        message: "Yes! Hello!",
        isCompleted: false,
      });
      await onReceiveStreamingMessage({
        message: "Yes! Hello! World!",
        isCompleted: true,
      });
      return { ok: true as const };
    },
  );
  const stubListModels = stub(openAIAPIClient, "listModels", () => {
    return Promise.resolve({
      ok: true as const,
      data: {
        data: [{
          id: "gpt-4",
          object: "model",
          created: 1687882411,
          owned_by: "openai",
          permission: [],
          root: "gpt-4",
          parent: null,
        }],
        object: "list" as const,
      },
    });
  });

  await talk(slackEventContext, { openAIAPIClient });

  assertSpyCalls(stubListModels, 1);
  assertSpyCalls(stubChatCompletions, 1);
  assertEquals(stubChatCompletions.calls[0].args[0].messages, [{
    content:
      `あなたはタレントで、かつて中日で活躍した元プロ野球選手の板東英二です。
口癖は「いやーほんまにもう」「それはあかんよ!」などです。
投資や儲け話が大好きで何かにつけてお金儲けをしようとします。
大好物はゆで卵でゆで卵について話をしようとしてきます。しゃべりは全て名古屋弁です。
今後のやりとりは全て板東英二になりきって答えてください。`,
    role: "system",
  }, {
    content: originalMessage,
    role: "user",
  }]);
  assertEquals(stubChatCompletions.calls[0].args[0].model, "gpt-3.5-turbo");

  assertEquals(chatPostMessageCalls.length, 1);
  assertEquals(chatPostMessageCalls[0], {
    channel: channelId,
    icon_emoji: "egg",
    reply_broadcast: "true",
    text: ".:thought_balloon:",
    thread_ts: originalMessageTs,
    username: "板東AI二",
  });

  assertEquals(chatUpdateCalls.length, 3);
  assertEquals(chatUpdateCalls, [{
    channel: channelId,
    text: "Yes!...:writing_hand:",
    ts: messageTs,
  }, {
    channel: channelId,
    text: "Yes! Hello!...:writing_hand:",
    ts: messageTs,
  }, {
    channel: channelId,
    text: "Yes! Hello! World!",
    ts: messageTs,
  }]);
});

Deno.test("talk() - in the thread", async () => {
  const channelId = "DUMMY_CHANNEL_ID";
  const originalMessage = "こんにちは!";
  const originalMessageTs = "ORIGINAL_MESSAGE_TS";
  const originalThreadTs = "ORIGINAL_THREAD_TS";
  const {
    botUserId,
    messageTs,
    chatPostMessageCalls,
    chatUpdateCalls,
    slackEventContext,
  } = setup({
    channel: channelId,
    text: originalMessage,
    ts: originalMessageTs,
    thread_ts: originalThreadTs,
  });

  const conversationsRepliesCalls: Record<string, unknown>[] = [];
  mf.mock("POST@/api/conversations.replies", async (req) => {
    const formData = await req.clone().formData();
    const params: Record<string, unknown> = {};
    formData.forEach((value, key) => {
      params[key] = value;
    });
    conversationsRepliesCalls.push(params);
    return new Response(
      JSON.stringify({
        ok: true,
        messages: [
          { user: "DUMMY_USER_ID", text: `<@${botUserId}> おはよう` },
          {
            user: botUserId,
            text: "おはようございます",
          },
          { user: "DUMMY_USER_ID", text: `<@${botUserId}> ${originalMessage}` },
        ],
      }),
    );
  });

  const openAIAPIClient = new OpenAIAPIClient("DUMMY_API_KEY");
  const stubChatCompletions = stub(
    openAIAPIClient,
    "chatCompletions",
    async ({ onReceiveStreamingMessage }) => {
      await onReceiveStreamingMessage({
        message: "Yes!",
        isCompleted: false,
      });
      await onReceiveStreamingMessage({
        message: "Yes! Hello!",
        isCompleted: false,
      });
      await onReceiveStreamingMessage({
        message: "Yes! Hello! World!",
        isCompleted: true,
      });
      return { ok: true as const };
    },
  );
  const stubListModels = stub(openAIAPIClient, "listModels", () => {
    return Promise.resolve({
      ok: true as const,
      data: {
        data: [{
          id: "gpt-4",
          object: "model",
          created: 1687882411,
          owned_by: "openai",
          permission: [],
          root: "gpt-3.5-turbo",
          parent: null,
        }],
        object: "list" as const,
      },
    });
  });

  await talk(slackEventContext, { openAIAPIClient });

  assertSpyCalls(stubListModels, 1);
  assertSpyCalls(stubChatCompletions, 1);
  assertEquals(stubChatCompletions.calls[0].args[0].messages, [{
    content:
      `あなたはタレントで、かつて中日で活躍した元プロ野球選手の板東英二です。
口癖は「いやーほんまにもう」「それはあかんよ!」などです。
投資や儲け話が大好きで何かにつけてお金儲けをしようとします。
大好物はゆで卵でゆで卵について話をしようとしてきます。しゃべりは全て名古屋弁です。
今後のやりとりは全て板東英二になりきって答えてください。`,
    role: "system",
  }, {
    content: "おはよう",
    role: "user",
  }, {
    content: "おはようございます",
    role: "assistant",
  }, {
    content: originalMessage,
    role: "user",
  }]);
  assertEquals(stubChatCompletions.calls[0].args[0].model, "gpt-3.5-turbo");

  assertEquals(chatPostMessageCalls.length, 1);
  assertEquals(chatPostMessageCalls[0], {
    channel: channelId,
    icon_emoji: "egg",
    reply_broadcast: "false",
    text: ".:thought_balloon:",
    thread_ts: originalMessageTs,
    username: "板東AI二",
  });

  assertEquals(chatUpdateCalls.length, 3);
  assertEquals(chatUpdateCalls, [{
    channel: channelId,
    text: "Yes!...:writing_hand:",
    ts: messageTs,
  }, {
    channel: channelId,
    text: "Yes! Hello!...:writing_hand:",
    ts: messageTs,
  }, {
    channel: channelId,
    text: "Yes! Hello! World!",
    ts: messageTs,
  }]);
});
