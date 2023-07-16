import { assertEquals } from "std/testing/asserts.ts";
import { verifyRequest } from "./slack.ts";

const setup = () => {
  // test data from: https://api.slack.com/authentication/verifying-requests-from-slack
  const slackRequestTimestamp = 1531420618;
  const signingSecret = "8f742231b10e8888abcd99yyyzzz85a5";
  const req = new Request("https://example.com", {
    method: "POST",
    body: new TextEncoder().encode(
      "token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c",
    ),
    headers: new Headers({
      "x-slack-request-timestamp": slackRequestTimestamp.toString(),
      "x-slack-signature":
        "v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503",
    }),
  });
  return { req, slackRequestTimestamp, signingSecret };
};

Deno.test("verifyRequest", async () => {
  const { req, slackRequestTimestamp, signingSecret } = setup();
  const now = new Date(slackRequestTimestamp * 1000).getTime();
  const isVerified = await verifyRequest(req, {
    signingSecret,
    targetTimestamp: now,
  });
  assertEquals(isVerified, true);
});

Deno.test("verifyRequest - request timestamp is more than 5 minutes from local time", async () => {
  const { req, slackRequestTimestamp, signingSecret } = setup();
  const now = new Date((slackRequestTimestamp + (60 * 5) + 1) * 1000)
    .getTime();
  const isVerified = await verifyRequest(req, {
    signingSecret,
    targetTimestamp: now,
  });
  assertEquals(isVerified, false);
});
