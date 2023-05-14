import { talk } from "../../counsellor.ts";
import { createEventContext, verifyRequest } from "../../slack.ts";

export default async (req: Request) => {
  if (req.headers.get("content-type") !== "application/json") {
    return new Response("Invalid Content-Type", { status: 400 });
  }
  const verified = await verifyRequest(req.clone());
  if (!verified) {
    return new Response("Invalid Signature", { status: 400 });
  }
  const body = await req.json();
  console.log("body", body);
  switch (body.type) {
    case "url_verification":
      return new Response(body.challenge, { status: 200 });
    case "event_callback":
      if (body.event.type === "app_mention") {
        const ctx = createEventContext(body);
        talk(ctx);
        return new Response();
      }
      console.log("unsupported event type", body.event.type);
      return new Response();
    default:
      console.log("unsupported body type", body.type);
      return new Response();
  }
};
