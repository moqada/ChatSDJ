import * as mf from "mock_fetch/mod.ts";
import { assertEquals, assertExists } from "std/testing/asserts.ts";
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
  const chatDeleteCalls: Record<string, unknown>[] = [];
  const chatFilesUploadCalls: Record<string, unknown>[] = [];
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
  mf.mock("POST@/api/chat.delete", async (req) => {
    const formData = await req.clone().formData();
    const params: Record<string, unknown> = {};
    formData.forEach((value, key) => {
      params[key] = value;
    });
    chatDeleteCalls.push(params);
    return new Response(
      JSON.stringify({
        ok: true,
        channel: slackEvent.channel,
        ts: Date.now().toString(),
      }),
    );
  });
  mf.mock("POST@/api/files.upload", async (req) => {
    const formData = await req.clone().formData();
    const params: Record<string, unknown> = {};
    formData.forEach((value, key) => {
      params[key] = value;
    });
    chatFilesUploadCalls.push(params);
    return new Response(
      JSON.stringify({
        ok: true,
        file: {
          id: "dummyId",
          created: 1629876543,
          timestamp: 1629876543,
          name: "dummyImage.png",
          title: "Dummy Image",
          mimetype: "image/png",
          filetype: "png",
          pretty_type: "PNG",
          user: "dummyUser",
          editable: false,
          size: 1024,
          mode: "dummyMode",
          is_external: false,
          external_type: "dummyExternalType",
          is_public: true,
          public_url_shared: false,
          display_as_bot: false,
          username: "dummyUsername",
          url_private: "https://example.com/private",
          url_private_download: "https://example.com/private/download",
          thumb_64: "https://example.com/thumb64",
          thumb_80: "https://example.com/thumb80",
          thumb_360: "https://example.com/thumb360",
          thumb_360_w: 360,
          thumb_360_h: 240,
          thumb_480: "https://example.com/thumb480",
          thumb_480_w: 480,
          thumb_480_h: 320,
          thumb_160: "https://example.com/thumb160",
          image_exif_rotation: 0,
          original_w: 800,
          original_h: 600,
          permalink: "https://example.com/permalink",
          permalink_public: "https://example.com/permalink/public",
          comments_count: 0,
          is_starred: false,
          channels: [slackEvent.channel],
          shares: {
            public: {
              [slackEvent.channel]: [{
                reply_users: [],
                reply_users_count: 0,
                reply_count: 0,
                ts: "DUMMY_UPLOADED_IMAGE_TS",
              }],
            },
          },
        },
      }),
    );
  });

  const slackEventContext = createSlackEventContext({
    apiToken: "DUMMY_API_KEY",
    payload: {
      authorizations: [{ user_id: botUserId }],
      api_app_id: "DUMMY_APP_ID",
      event: slackEvent,
    },
  });

  return {
    botUserId,
    messageTs,
    chatDeleteCalls,
    chatFilesUploadCalls,
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
    async ({ onReceiveStreamingResponse }) => {
      await onReceiveStreamingResponse({
        message: "Yes!",
        isCompleted: false,
      });
      await onReceiveStreamingResponse({
        message: "Yes! Hello!",
        isCompleted: false,
      });
      await onReceiveStreamingResponse({
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
今後のやりとりは全て板東英二になりきって答えてください。\n\`generated_image: \`で始まるassistantのメッセージはfunction calling経由で画像が生成されたことを表現しています。`,
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
    metadata: JSON.stringify({
      event_type: "chatsdj_reply",
      event_payload: { ignored: true },
    }),
    reply_broadcast: "true",
    text: ".:thought_balloon:",
    thread_ts: originalMessageTs,
    username: "板東AI二",
  });

  assertEquals(chatUpdateCalls.length, 3);
  assertEquals(chatUpdateCalls, [{
    channel: channelId,
    metadata: JSON.stringify({
      event_type: "chatsdj_reply",
      event_payload: { ignored: false },
    }),
    text: "Yes!...:writing_hand:",
    ts: messageTs,
  }, {
    channel: channelId,
    metadata: JSON.stringify({
      event_type: "chatsdj_reply",
      event_payload: { ignored: false },
    }),
    text: "Yes! Hello!...:writing_hand:",
    ts: messageTs,
  }, {
    channel: channelId,
    metadata: JSON.stringify({
      event_type: "chatsdj_reply",
      event_payload: { ignored: false },
    }),
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
    async ({ onReceiveStreamingResponse }) => {
      await onReceiveStreamingResponse({
        message: "Yes!",
        isCompleted: false,
      });
      await onReceiveStreamingResponse({
        message: "Yes! Hello!",
        isCompleted: false,
      });
      await onReceiveStreamingResponse({
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
今後のやりとりは全て板東英二になりきって答えてください。\n\`generated_image: \`で始まるassistantのメッセージはfunction calling経由で画像が生成されたことを表現しています。`,
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
    metadata: JSON.stringify({
      event_type: "chatsdj_reply",
      event_payload: { ignored: true },
    }),
    reply_broadcast: "false",
    text: ".:thought_balloon:",
    thread_ts: originalMessageTs,
    username: "板東AI二",
  });

  assertEquals(chatUpdateCalls.length, 3);
  assertEquals(chatUpdateCalls, [{
    channel: channelId,
    metadata: JSON.stringify({
      event_type: "chatsdj_reply",
      event_payload: { ignored: false },
    }),
    text: "Yes!...:writing_hand:",
    ts: messageTs,
  }, {
    channel: channelId,
    metadata: JSON.stringify({
      event_type: "chatsdj_reply",
      event_payload: { ignored: false },
    }),
    text: "Yes! Hello!...:writing_hand:",
    ts: messageTs,
  }, {
    channel: channelId,
    metadata: JSON.stringify({
      event_type: "chatsdj_reply",
      event_payload: { ignored: false },
    }),
    text: "Yes! Hello! World!",
    ts: messageTs,
  }]);
});

Deno.test("talk() - image generation", async () => {
  const channelId = "DUMMY_CHANNEL_ID";
  const originalMessage = "こんにちは!";
  const originalMessageTs = "ORIGINAL_MESSAGE_TS";
  const {
    messageTs,
    chatPostMessageCalls,
    chatUpdateCalls,
    chatDeleteCalls,
    chatFilesUploadCalls,
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
    async ({ onReceiveStreamingResponse }) => {
      await onReceiveStreamingResponse({
        tool: {
          name: "image_generation",
          arguments: { prompt: "良い景色" },
        },
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
  const stubGenerateImage = stub(openAIAPIClient, "generateImage", () => {
    return Promise.resolve({
      ok: true as const,
      data: {
        created: 1629876543,
        data: [{
          b64_json: "RFVNTVlfSU1BR0U=", // base64 encoded "DUMMY_IMAGE"
          revised_prompt: "",
        }],
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
今後のやりとりは全て板東英二になりきって答えてください。\n\`generated_image: \`で始まるassistantのメッセージはfunction calling経由で画像が生成されたことを表現しています。`,
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
    metadata: JSON.stringify({
      event_type: "chatsdj_reply",
      event_payload: { ignored: true },
    }),
    reply_broadcast: "true",
    text: ".:thought_balloon:",
    thread_ts: originalMessageTs,
    username: "板東AI二",
  });

  assertEquals(chatUpdateCalls.length, 3);
  assertEquals(chatUpdateCalls, [{
    channel: channelId,
    text: "画像生成中...:art:",
    ts: messageTs,
  }, {
    channel: channelId,
    text: " ",
    metadata: JSON.stringify({
      event_type: "chatsdj_reply",
      event_payload: { image: "良い景色", ignored: false },
    }),
    ts: "DUMMY_UPLOADED_IMAGE_TS",
  }, {
    channel: channelId,
    reply_broadcast: "true",
    ts: "DUMMY_UPLOADED_IMAGE_TS",
  }]);

  assertEquals(stubGenerateImage.calls.length, 1);
  assertEquals(stubGenerateImage.calls[0].args, [{
    model: "dall-e-3",
    prompt: "良い景色",
  }]);

  assertEquals(chatDeleteCalls.length, 1);
  assertEquals(chatDeleteCalls, [{ channel: channelId, ts: messageTs }]);

  assertEquals(chatFilesUploadCalls.length, 1);
  assertEquals(chatFilesUploadCalls[0].channels, channelId);
  assertEquals(chatFilesUploadCalls[0].filename, "chatSDJ.png");
  assertEquals(chatFilesUploadCalls[0].filetype, "png");
  assertEquals(chatFilesUploadCalls[0].thread_ts, originalMessageTs);
  assertEquals(chatFilesUploadCalls[0].title, "良い景色");
  assertExists(chatFilesUploadCalls[0].file);
});
