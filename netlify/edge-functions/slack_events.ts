import {
  OPENAI_API_KEY,
  SLACK_API_TOKEN,
  SLACK_SIGNING_SECRET,
} from "../../config.ts";
import { talk } from "../../counsellor.ts";
import { OpenAIAPIClient } from "../../openai.ts";
import { createSlackEventContext, verifyRequest } from "../../slack.ts";

export default async (req: Request) => {
  if (!OPENAI_API_KEY) {
    return new Response("OPENAI_API_KEY is not set", { status: 500 });
  } else if (!SLACK_API_TOKEN) {
    return new Response("SLACK_API_TOKEN is not set", { status: 500 });
  } else if (!SLACK_SIGNING_SECRET) {
    return new Response("SLACK_SIGNING_SECRET is not set", { status: 500 });
  }
  if (req.headers.get("content-type") !== "application/json") {
    return new Response("Invalid Content-Type", { status: 400 });
  }

  const verified = await verifyRequest(req.clone(), {
    signingSecret: SLACK_SIGNING_SECRET,
    targetTimestamp: Date.now(),
  });
  if (!verified) {
    return new Response("Invalid Signature", { status: 400 });
  }
  const body = await req.json();
  switch (body.type) {
    case "url_verification":
      return new Response(body.challenge, { status: 200 });
    case "event_callback":
      if (body.event.type === "app_mention") {
        const openAIAPIClient = new OpenAIAPIClient(OPENAI_API_KEY);
        const slackEventCtx = createSlackEventContext({
          apiToken: SLACK_API_TOKEN,
          payload: body,
        });
        talk(slackEventCtx, { openAIAPIClient });
        return new Response();
      }
      console.log("unsupported event type", body.event.type);
      return new Response();
    default:
      console.log("unsupported body type", body.type);
      return new Response();
  }
};
