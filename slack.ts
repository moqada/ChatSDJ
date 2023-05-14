import { crypto, toHashString } from "std/crypto/mod.ts";
import { SlackAPI } from "deno-slack-api/mod.ts";

const SLACK_API_TOKEN = Deno.env.get("SLACK_API_TOKEN");
const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET");

type EventPayload = {
  authorizations: [{ user_id: string }];
  event: {
    channel: string;
    thread_ts?: string;
    text: string;
    ts: string;
  };
};

export type SlackAPIClient = ReturnType<typeof SlackAPI>;
export type EventContext = {
  authUserId: string;
  client: SlackAPIClient;
  event: EventPayload["event"];
  postMessage: (
    text: string,
    opts?: {
      threadTs?: string;
      isReplyBroadcast?: boolean;
      iconEmoji?: string;
      username?: string;
    },
  ) => Promise<
    { ok: true; ts: string; channelId: string } | { ok: false; error: unknown }
  >;
  updateMessage: (
    text: string,
    opts: { channelId: string; ts: string },
  ) => Promise<{ ok: true } | { ok: false; error: unknown }>;
};

export const createEventContext = (payload: EventPayload): EventContext => {
  if (!SLACK_API_TOKEN) {
    throw new Error("SLACK_API_TOKEN is not set");
  }
  const { authorizations, event } = payload;
  const client = SlackAPI(SLACK_API_TOKEN);
  const authUserId = authorizations[0].user_id;

  const postMessage: EventContext["postMessage"] = async (
    text: string,
    opts,
  ) => {
    const res = await client.chat.postMessage({
      channel: event.channel,
      text,
      thread_ts: opts?.threadTs || event.thread_ts,
      ...(opts?.isReplyBroadcast && { reply_broadcast: true }),
      ...(opts?.iconEmoji && { icon_emoji: opts.iconEmoji }),
      ...(opts?.username && { username: opts.username }),
    });
    if (!res.ok) {
      return { ok: false, error: res.error };
    }
    return { ok: true, channelId: res.channel, ts: res.ts };
  };

  const updateMessage: EventContext["updateMessage"] = async (
    text,
    { channelId, ts },
  ) => {
    const res = await client.chat.update({ channel: channelId, text, ts });
    if (!res.ok) {
      return { ok: false, error: res.error };
    }
    return { ok: true };
  };

  return {
    authUserId,
    client,
    event,
    postMessage,
    updateMessage,
  };
};

/**
 * Verify request from Slack
 *
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export const verifyRequest = async (req: Request) => {
  const body = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp");
  if (Date.now() / 1000 - Number(timestamp) > 60 * 5) {
    // The request timestamp is more than five minutes from local time.
    // It could be a replay attack, so let's ignore it.
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SLACK_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBaseString = `v0:${timestamp}:${body}`;
  const signature = await crypto.subtle.sign(
    { name: "HMAC" },
    key,
    new TextEncoder().encode(sigBaseString),
  );
  const hash = `v0=${toHashString(signature)}`;
  const slackSignature = req.headers.get("x-slack-signature");
  console.log("hash", hash, slackSignature, hash === slackSignature);
  return hash === slackSignature;
};
