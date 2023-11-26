import { crypto, toHashString } from "std/crypto/mod.ts";
import { SlackAPI } from "deno-slack-api/mod.ts";

type EventPayload = {
  api_app_id: string;
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
  apiToken: string;
  appId: string;
  authUserId: string;
  client: SlackAPIClient;
  event: EventPayload["event"];
};

export const createSlackEventContext = (
  { apiToken, payload }: { apiToken: string; payload: EventPayload },
): SlackEventContext => {
  const { api_app_id: appId, authorizations, event } = payload;
  const client = SlackAPI(apiToken);
  const authUserId = authorizations[0].user_id;
  return { apiToken, appId, authUserId, client, event };
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

type UploadImageFileShare = {
  reply_users: string[];
  reply_users_count: number;
  reply_count: number;
  ts: string;
};
type UploadImageFile = {
  id: string;
  created: number;
  timestamp: number;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  pretty_type: string;
  user: string;
  editable: boolean;
  size: number;
  mode: string;
  is_external: boolean;
  external_type: string;
  is_public: boolean;
  public_url_shared: boolean;
  display_as_bot: boolean;
  username: string;
  url_private: string;
  url_private_download: string;
  thumb_64?: string;
  thumb_80?: string;
  thumb_360?: string;
  thumb_360_w?: number;
  thumb_360_h?: number;
  thumb_480?: string;
  thumb_480_w?: number;
  thumb_480_h?: number;
  thumb_160?: string;
  image_exif_rotation: number;
  original_w: number;
  original_h: number;
  permalink: string;
  permalink_public: string;
  comments_count: number;
  is_starred: boolean;
  shares: {
    [K in "private" | "public"]?: { [key: string]: UploadImageFileShare[] };
  };
  channels: string[];
  groups: string[];
  ims: string[];
  has_rich_preview: boolean;
};
export type UploadImageResponse = {
  ok: boolean;
  file: UploadImageFile;
};

/**
 * Upload PNG image file to Slack
 */
export const uploadPNGImageFile = async (
  { apiToken, base64Image, channels, threadTs, filename, title }: {
    apiToken: string;
    base64Image: string;
    channels?: string;
    threadTs?: string;
    filename: string;
    title: string;
  },
): Promise<
  { ok: false; error: unknown } | { ok: true; data: UploadImageResponse }
> => {
  const imageData = Uint8Array.from(
    atob(base64Image),
    (c) => c.charCodeAt(0),
  );
  // client.files.upload は動作しないため、直接APIを叩く
  const formData = new FormData();
  if (channels) {
    formData.append("channels", channels);
  }
  if (threadTs) {
    formData.append("thread_ts", threadTs);
  }
  formData.append("filetype", "png");
  formData.append("filename", filename);
  formData.append("file", new Blob([imageData], { type: "image/png" }));
  formData.append("title", title);
  const resUpload = await fetch("https://slack.com/api/files.upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
    body: formData,
  });
  if (!resUpload.ok) {
    return { ok: false, error: await resUpload.text() };
  }
  return { ok: true, data: await resUpload.json() };
};
