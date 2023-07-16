import { crypto, toHashString } from "std/crypto/mod.ts";
import { SlackAPI } from "deno-slack-api/mod.ts";

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
export type SlackEventContext = {
  authUserId: string;
  client: SlackAPIClient;
  event: EventPayload["event"];
};

export const createSlackEventContext = (
  { apiToken, payload }: { apiToken: string; payload: EventPayload },
): SlackEventContext => {
  const { authorizations, event } = payload;
  const client = SlackAPI(apiToken);
  const authUserId = authorizations[0].user_id;
  return { authUserId, client, event };
};

/**
 * Verify request from Slack
 *
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export const verifyRequest = async (
  req: Request,
  { signingSecret, targetTimestamp }: {
    signingSecret: string;
    targetTimestamp: number;
  },
) => {
  const body = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp");
  if (targetTimestamp / 1000 - Number(timestamp) > 60 * 5) {
    // The request timestamp is more than five minutes from local time.
    // It could be a replay attack, so let's ignore it.
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
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
