import * as log from "std/log/mod.ts";
import { authenticate, getSpreadSheetValues } from "./google.ts";
import { ChatCompletionMessage, OpenAIAPIClient } from "./openai.ts";
import { SlackEventContext, uploadPNGImageFile } from "./slack.ts";
import {
  DEFAULT_COUNSELLOR_EMOJI,
  ERROR_MESSAGE,
  GOOGLE_SPREADSHEET_ID,
  IMAGE_GENERATION_LOADING_MESSAGE,
  INITIAL_MESSAGE,
  LOADING_SIGN,
  OPENAI_DEFAULT_MODEL,
} from "./config.ts";

type Counsellor = {
  name: string;
  emoji: string;
  prompt: string;
  model?: string;
};

const DEFAULT_COUNSELLOR = {
  name: "板東AI二",
  emoji: DEFAULT_COUNSELLOR_EMOJI,
  prompt: `
あなたはタレントで、かつて中日で活躍した元プロ野球選手の板東英二です。
口癖は「いやーほんまにもう」「それはあかんよ!」などです。
投資や儲け話が大好きで何かにつけてお金儲けをしようとします。
大好物はゆで卵でゆで卵について話をしようとしてきます。しゃべりは全て名古屋弁です。
今後のやりとりは全て板東英二になりきって答えてください。
  `.trim(),
} satisfies Counsellor;
const COMMON_COUNSELLOR_PROMPT =
  "`generated_image: `で始まるassistantのメッセージはfunction calling経由で画像が生成されたことを表現しています。";
const FUNCTION_CALLING_IMAGE_GENERATION = {
  type: "function" as const,
  function: {
    name: "generate_image",
    description: "Generate an image from a prompt",
    parameters: {
      type: "object" as const,
      properties: {
        prompt: {
          type: "string" as const,
          description: "the description for generating an image",
        },
      },
      required: ["prompt"],
    },
  },
};

type ChatSDJReplyMetadata = {
  event_type: "chatsdj_reply";
  event_payload: {
    image: string;
    ignored: boolean;
  } | {
    ignored: boolean;
  };
};

const isChatSDJReplyMetadata = (
  metadata: unknown,
): metadata is ChatSDJReplyMetadata => {
  return !!metadata && typeof metadata === "object" &&
    "event_type" in metadata && "event_payload" in metadata &&
    metadata.event_type == "chatsdj_reply";
};

/**
 * Slack 投稿メッセージに含める metadata
 *
 * type: ignored のメッセージはプロンプト連携の対象外として扱う。
 * type: text のメッセージは通常のテキストメッセージとしてプロンプト連携対象とする。
 * type: image のメッセージは生成された画像の説明としてプロンプト連携対象とする。
 */
const createReplyMetadata = (
  params: { type: "ignored" } | { type: "text" } | {
    type: "image";
    prompt: string;
  },
) => {
  let payload;
  switch (params.type) {
    case "ignored":
      payload = { ignored: true };
      break;
    case "text":
      payload = { ignored: false };
      break;
    case "image":
      payload = { image: params.prompt, ignored: false };
      break;
    default:
      throw new Error("unknown type");
  }
  return {
    event_type: "chatsdj_reply",
    event_payload: payload,
  };
};

type SlackRepliesMessage = {
  user?: string;
  subtype?: string;
  bot_id?: string;
  app_id?: string;
  text: string;
} & Record<string, unknown>;

/**
 * プロンプト連携対象のメッセージリストを構築する
 */
const buildPromptMessages = async (
  { ctx }: { ctx: SlackEventContext },
) => {
  const { appId, authUserId, event, client: slackAPIClient } = ctx;
  if (!event.thread_ts) {
    return [{
      role: "user" as const,
      content: event.text as string,
    }];
  }
  const res = await slackAPIClient.conversations.replies({
    channel: event.channel,
    include_all_metadata: true,
    ts: event.thread_ts,
  });
  if (!res.ok) {
    throw new Error("client.conversations.replies failed", {
      cause: res.error,
    });
  }
  const messages: SlackRepliesMessage[] = res.messages;
  return messages.reduce(
    (acc, cur) => {
      const mentionPattern = new RegExp(`^<@${authUserId}>\s*`, "i");
      if (cur.user === authUserId || cur.app_id === appId) {
        let content = cur.text;
        if (isChatSDJReplyMetadata(cur.metadata)) {
          const payload = cur.metadata.event_payload;
          if (payload.ignored) {
            return acc;
          } else if ("image" in payload && payload.image) {
            content = `generated_image: ${payload.image}`;
          }
        }
        return content
          ? [...acc, { role: "assistant" as const, content }]
          : acc;
      }
      const text = cur.text.replace(mentionPattern, "").trim();
      return [
        ...acc,
        {
          role: "user" as const,
          content: text,
        },
      ];
    },
    [] as ChatCompletionMessage[],
    // トークン数調整のため対象メッセージを最新20件に決め打ちで制限する
  ).slice(-20);
};

/**
 * 相談員を選択する
 *
 * スプレッドシート指定がある場合はランダム、ない場合はデフォルト相談員を返す
 */
const selectCounsellor = async (): Promise<Counsellor> => {
  if (!GOOGLE_SPREADSHEET_ID) {
    return DEFAULT_COUNSELLOR;
  }
  const authData = await authenticate();
  const sheetData = await getSpreadSheetValues({
    spreadsheetId: GOOGLE_SPREADSHEET_ID,
    token: authData.access_token,
  });
  const rows = sheetData.values;
  const row = rows[
    Math.floor(Math.random() * rows.length)
  ];
  if (row[0] && row[1] && row[2]) {
    return {
      name: row[0],
      emoji: row[1],
      prompt: row[2],
      model: row[3],
    };
  }
  return DEFAULT_COUNSELLOR;
};

/**
 * エラーメッセージを投稿する
 *
 * 相談員のドラフトメッセージが存在する場合は削除し、エラーメッセージは可能な限り所長が投稿する。
 */
const postErrorMessage = async (
  { ctx: { client, event }, error, isReplyBroadcast, logger, draftMessage }: {
    ctx: SlackEventContext;
    error: unknown;
    isReplyBroadcast: boolean;
    logger: log.Logger;
    draftMessage?: {
      channel: string;
      ts: string;
    };
  },
) => {
  const text = error
    ? `${ERROR_MESSAGE}\n\`\`\`\n${error}\n\`\`\``
    : ERROR_MESSAGE;
  if (draftMessage) {
    const resDelete = await client.chat.delete({
      channel: draftMessage.channel,
      ts: draftMessage.ts,
    });
    if (!resDelete.ok) {
      logger.error("original message deleting failed", resDelete.error);
      // 削除に失敗した場合はオリジナルメッセージの更新を試みる
      const resUpdate = await client.chat.update({
        channel: draftMessage.channel,
        text,
        ts: draftMessage.ts,
      });
      if (!resUpdate.ok) {
        logger.error("error message updating failed", resUpdate.error);
      }
      return;
    }
  }
  const resPost = await client.chat.postMessage({
    channel: event.channel,
    text,
    thread_ts: event.ts,
    metadata: JSON.stringify(createReplyMetadata({ type: "ignored" })),
    reply_broadcast: isReplyBroadcast,
  });
  if (!resPost.ok) {
    logger.error("error message posting failed", resPost.error);
  }
};

/**
 * 相談員がテキストで返信する
 */
const replyText = async (
  { ctx, logger, result, draftMessage }: {
    ctx: SlackEventContext;
    logger: log.Logger;
    result: { message: string; isCompleted: boolean };
    draftMessage: {
      channel: string;
      ts: string;
    };
  },
) => {
  const { client: slackAPIClient } = ctx;
  const { message, isCompleted } = result;
  const res = await slackAPIClient.chat.update({
    channel: draftMessage.channel,
    metadata: JSON.stringify(createReplyMetadata({ type: "text" })),
    text: isCompleted ? message : `${message}${LOADING_SIGN}`,
    ts: draftMessage.ts,
  });
  if (!res.ok) {
    logger.error("update message posting failed", res.error);
  }
};

/**
 * 相談員が画像で返信する
 */
const replyImage = async ({
  ctx,
  draftMessage,
  isReplyBroadcast,
  result,
  logger,
  openAIAPIClient,
}: {
  ctx: SlackEventContext;
  isReplyBroadcast: boolean;
  logger: log.Logger;
  result: {
    tool: {
      name: string;
      arguments: Record<string, string>;
    };
    isCompleted: true;
  };
  openAIAPIClient: OpenAIAPIClient;
  draftMessage: {
    channel: string;
    ts: string;
  };
}) => {
  const { apiToken: slackAPIToken, client: slackAPIClient } = ctx;
  const resMessage = await slackAPIClient.chat.update({
    channel: draftMessage.channel,
    text: IMAGE_GENERATION_LOADING_MESSAGE,
    ts: draftMessage.ts,
  });
  if (!resMessage.ok) {
    logger.error("update message posting failed", resMessage.error);
  }

  const imagePrompt = result.tool.arguments.prompt;
  const resImage = await openAIAPIClient.generateImage({
    model: "dall-e-3",
    prompt: imagePrompt,
  });
  if (!resImage.ok) {
    logger.error("image generation failed", resImage.error);
    await postErrorMessage({
      ctx,
      error: resImage.error,
      isReplyBroadcast,
      logger,
      draftMessage,
    });
    return;
  }

  const resDelete = await slackAPIClient.chat.delete({
    channel: draftMessage.channel,
    ts: draftMessage.ts,
  });
  if (!resDelete.ok) {
    logger.error("draft message deleting failed", resDelete.error);
  }

  const resUpload = await uploadPNGImageFile({
    apiToken: slackAPIToken,
    channels: ctx.event.channel,
    threadTs: ctx.event.ts,
    base64Image: resImage.data.data[0].b64_json,
    filename: "chatSDJ.png",
    title: imagePrompt,
  });
  if (!resUpload.ok) {
    logger.error("image uploading failed", resUpload.error);
    await postErrorMessage({
      ctx,
      error: resUpload.error,
      isReplyBroadcast,
      logger,
      draftMessage: resDelete.ok ? undefined : draftMessage,
    });
    return;
  }

  const sharedChannel = resUpload.data.file.channels[0];
  const shares = resUpload.data.file.shares;
  const sharedTs = resUpload.data.file.is_public
    ? shares.public?.[sharedChannel][0].ts
    : shares.private?.[sharedChannel][0].ts;
  const resUpdateMetadata = await slackAPIClient.chat.update({
    channel: sharedChannel,
    ts: sharedTs,
    // text に何か指定しないと metadata を更新できない
    text: " ",
    metadata: JSON.stringify(
      createReplyMetadata({
        type: "image",
        prompt: imagePrompt,
      }),
    ),
  });
  if (!resUpdateMetadata.ok) {
    logger.error("image metadata updating failed", resUpdateMetadata.error);
  }
  if (isReplyBroadcast) {
    // broadcasting と 内容の更新は同時にできないため、別リクエストで broadcasting を行う
    const resBroadcast = await slackAPIClient.chat.update({
      channel: sharedChannel,
      ts: sharedTs,
      reply_broadcast: true,
    });
    if (!resBroadcast.ok) {
      logger.error("image broadcasting failed", resBroadcast.error);
    }
  }
};

const createLogger = async (ctx: SlackEventContext): Promise<log.Logger> => {
  await log.setup({
    handlers: {
      console: new log.handlers.ConsoleHandler("DEBUG", {
        formatter: (logRecord) => {
          let msg =
            `${logRecord.levelName} (${ctx.event.ts}): ${logRecord.msg}`;
          logRecord.args.forEach((arg) => {
            msg += ` ${arg}`;
          });
          return msg;
        },
      }),
    },
    loggers: {
      "chatSDJ": { handlers: ["console"], level: "DEBUG" },
    },
  });
  return log.getLogger("chatSDJ");
};

export const talk = async (
  ctx: SlackEventContext,
  { openAIAPIClient }: {
    openAIAPIClient: OpenAIAPIClient;
  },
) => {
  const { client: slackAPIClient, event } = ctx;
  const logger = await createLogger(ctx);
  logger.info(`start (default model: ${OPENAI_DEFAULT_MODEL})`);

  let messages;
  let counsellor;
  try {
    counsellor = await selectCounsellor();
    messages = await buildPromptMessages({ ctx });
    logger.info(
      `counsellor: ${counsellor.name} (emoji: :${counsellor.emoji}:, model: ${counsellor.model})`,
    );
  } catch (error) {
    logger.error("preparing data failed", error);
    await postErrorMessage({ ctx, error, isReplyBroadcast: false, logger });
    return;
  }
  messages.unshift({
    role: "system",
    content: `${counsellor.prompt}\n${COMMON_COUNSELLOR_PROMPT}`,
  });

  // 始めての返信の場合は、thread_broadcast で返信する (systemプロンプトを含むと閾値が3になる)
  const isReplyBroadcast = messages.length < 3;
  const resDraftMessage = await slackAPIClient.chat.postMessage({
    channel: event.channel,
    text: INITIAL_MESSAGE,
    icon_emoji: counsellor.emoji,
    metadata: JSON.stringify(createReplyMetadata({ type: "ignored" })),
    username: counsellor.name,
    thread_ts: event.ts,
    reply_broadcast: isReplyBroadcast,
  });
  if (!resDraftMessage.ok) {
    logger.error("draft message posting failed", resDraftMessage.error);
    await postErrorMessage({
      ctx,
      error: resDraftMessage.error,
      isReplyBroadcast,
      logger,
    });
    return;
  }

  const resModels = await openAIAPIClient.listModels();
  if (!resModels.ok) {
    logger.error("fetch openai models failed", resModels.error);
    await postErrorMessage({
      ctx,
      error: resModels.error,
      isReplyBroadcast,
      logger,
      draftMessage: {
        channel: resDraftMessage.channel,
        ts: resDraftMessage.ts,
      },
    });
    return;
  }
  const model = counsellor.model || OPENAI_DEFAULT_MODEL;

  const resCompletions = await openAIAPIClient.chatCompletions({
    messages,
    model: resModels.data.data.some((item) => item.id === model)
      ? model
      : OPENAI_DEFAULT_MODEL,
    onReceiveStreamingResponse: async (result) => {
      if ("message" in result) {
        await replyText({
          ctx,
          draftMessage: resDraftMessage,
          logger,
          result,
        });
      } else {
        await replyImage({
          ctx,
          draftMessage: resDraftMessage,
          isReplyBroadcast,
          logger,
          openAIAPIClient,
          result,
        });
      }
    },
    tools: [FUNCTION_CALLING_IMAGE_GENERATION],
  });
  if (!resCompletions.ok) {
    logger.error("openai.chatCompletions failed", resCompletions.error);
    await postErrorMessage({
      ctx,
      error: resCompletions.error,
      isReplyBroadcast,
      logger,
      draftMessage: {
        channel: resDraftMessage.channel,
        ts: resDraftMessage.ts,
      },
    });
    return;
  }
  logger.info("done");
};
