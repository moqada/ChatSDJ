// base64 encoded google-service-account.json
export const GOOGLE_CREDENTIALS = Deno.env.get("GOOGLE_CREDENTIALS");
export const GOOGLE_SPREADSHEET_ID = Deno.env.get("GOOGLE_SPREADSHEET_ID");

export const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
export const OPENAI_DEFAULT_MODEL = Deno.env.get("OPENAI_DEFAULT_MODEL") ||
  "gpt-3.5-turbo";

export const SLACK_API_TOKEN = Deno.env.get("SLACK_API_TOKEN") || "";
export const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET") || "";

export const INITIAL_MESSAGE = Deno.env.get("CHATSDJ_INITIAL_MESSAGE") ||
  ".:thought_balloon:";
export const LOADING_SIGN = Deno.env.get("CHATSDJ_LOADING_SIGN") ||
  "...:writing_hand:";
export const ERROR_MESSAGE = Deno.env.get("CHATSDJ_ERROR_MESSAGE") ||
  "エラーが発生してもうたんや…";
export const IMAGE_GENERATION_LOADING_MESSAGE =
  Deno.env.get("CHATSDJ_IMAGE_GENERATION_LOADING_MESSAGE") ||
  "画像生成中...:art:";
export const DEFAULT_COUNSELLOR_EMOJI = Deno.env.get(
  "CHATSDJ_DEFAULT_COUNSELLOR_EMOJI",
) || "egg";
