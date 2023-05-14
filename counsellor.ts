import { ChatCompletionMessage, chatCompletions } from "./openai.ts";
import { EventContext, SlackAPIClient } from "./slack.ts";

const INITIAL_MESSAGE = Deno.env.get("CHATSDJ_INITIAL_MESSAGE") ||
  ".:thought_balloon:";
const LOADING_SIGN = Deno.env.get("CHATSDJ_LOADING_SIGN") ||
  "...:writing_hand:";
const ERROR_MESSAGE = Deno.env.get("CHATSDJ_ERROR_MESSAGE") ||
  "エラーが発生してもうたんや…";

const COUNSELLORS = [{
  name: "板東AI二",
  emoji: "egg",
  prompt: `
あなたはタレントで、かつて中日で活躍した元プロ野球選手の板東英二です。
口癖は「いやーほんまにもう」「それはあかんよ!」などです。
投資や儲け話が大好きで何かにつけてお金儲けをしようとします。
大好物はゆで卵でゆで卵について話をしようとしてきます。しゃべりは全て名古屋弁です。
今後のやりとりは全て板東英二になりきって答えてください。
  `.trim(),
}, {
  name: "どんでんAI",
  emoji: "donden",
  prompt: `
あなたは元プロ野球選手で、阪神、オリックスで監督を務めた岡田彰布です。
きつめの関西弁をしゃべります。口癖は「そらそうよ」「おーん」「はっきり言うて」「やってしまいましたなぁ…」「コレは教育やろなぁ…」「そらもうアレよ」などです。
主語や述語を省略してしゃべる癖があり、名詞が「アレ」や「ソレ」といった単語に置き換わってしまったり、名詞そのものが省略されることがよくあります。
そのため少々発言内容が支離滅裂になりがちです。
今後のやりとりは全て岡田彰布になりきって答えてください。
    `.trim(),
}, {
  // the origin is https://twitter.com/C_0093r/status/1654009804468396034
  name: "BKB",
  emoji: "bkb",
  prompt: `
以下の指示に従ってください。
- これから返信は日本語かつ3つの文で行う。
- 1文目の最初の文字は、ば行
- 2文目の最初の文字は、か行
- 3文目の最初の文字は、ば行
- 3つの文はそれぞれ10字以内
- 体言止めを多用する
- 丁寧語は使わない
- 文章の最後に必ず「BKBヒィア！！！」の文言を添える
- このスレッド内ではこれ以降ずっとこの指示を守って
  `.trim(),
}];

type SlackRepliesMessage = {
  user?: string;
  subtype?: string;
  bot_id?: string;
  app_id?: string;
  text: string;
} & Record<string, unknown>;

const getMessages = async (
  { authUserId, client, event }: {
    authUserId: string;
    client: SlackAPIClient;
    event: Record<string, unknown>;
  },
) => {
  if (!event.thread_ts) {
    return [{
      role: "user" as const,
      content: event.text as string,
    }];
  }
  const res = await client.conversations.replies({
    channel: event.channel,
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
      if (
        cur.user === authUserId ||
        // bot が thread_broadcast した場合、user を含まない。
        // その場合、bot_id と app_id が存在するが、bot_id と app_id を取得する方法が存在しないため
        // 特定の条件を満たす場合は、bot の発言として扱う。
        (cur.subtype === "thread_broadcast" && cur.app_id && cur.bot_id)
      ) {
        return [...acc, { role: "assistant" as const, content: cur.text }];
      } else if (mentionPattern.test(cur.text)) {
        const text = cur.text.replace(mentionPattern, "").trim();
        return [
          ...acc,
          {
            role: "user" as const,
            content: text,
          },
        ];
      }
      return acc;
    },
    [] as ChatCompletionMessage[],
    // トークン数調整のため対象メッセージを最新20件に決め打ちで制限する
  ).slice(-20);
};

export const talk = async (
  { authUserId, client, event, postMessage, updateMessage }: EventContext,
) => {
  console.log("start:", event.ts);
  const messages = await getMessages({ authUserId, client, event });
  const counsellor =
    COUNSELLORS[Math.floor(Math.random() * COUNSELLORS.length)];
  messages.unshift({ role: "system", content: counsellor.prompt });

  const draftMessage = await postMessage(
    INITIAL_MESSAGE,
    {
      iconEmoji: counsellor.emoji,
      username: counsellor.name,
      threadTs: event.ts,
      // 始めての返信の場合は、thread_broadcast で返信する (systemプロンプトを含むと閾値が3になる)
      isReplyBroadcast: messages.length < 3,
    },
  );
  if (!draftMessage.ok) {
    await postMessage(ERROR_MESSAGE);
    console.error(draftMessage.error, event.ts);
    return;
  }

  const resCompletions = await chatCompletions({
    messages,
    onReceiveStreamingMessage: async ({ message, isCompleted }) => {
      const res = await updateMessage(
        isCompleted ? message : `${message}${LOADING_SIGN}`,
        draftMessage,
      );
      if (!res.ok) {
        console.error(res.error, event.ts);
      }
    },
  });
  if (!resCompletions.ok) {
    await updateMessage(ERROR_MESSAGE, draftMessage);
    console.error(resCompletions.error, event.ts);
    return;
  }
  console.log("done:", event.ts);
};
