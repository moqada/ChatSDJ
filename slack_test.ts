import { assertEquals, assertExists } from "std/testing/asserts.ts";
import {
  UploadImageResponse,
  uploadPNGImageFile,
  verifyRequest,
} from "./slack.ts";
import * as mf from "mock_fetch/mod.ts";

mf.install();

const setupVerifyRequest = () => {
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
  const { req, slackRequestTimestamp, signingSecret } = setupVerifyRequest();
  const now = new Date(slackRequestTimestamp * 1000).getTime();
  const isVerified = await verifyRequest(req, {
    signingSecret,
    targetTimestamp: now,
  });
  assertEquals(isVerified, true);
});

Deno.test("verifyRequest - request timestamp is more than 5 minutes from local time", async () => {
  const { req, slackRequestTimestamp, signingSecret } = setupVerifyRequest();
  const now = new Date((slackRequestTimestamp + (60 * 5) + 1) * 1000)
    .getTime();
  const isVerified = await verifyRequest(req, {
    signingSecret,
    targetTimestamp: now,
  });
  assertEquals(isVerified, false);
});

Deno.test("uploadPNGImageFile", async () => {
  const dummyBody: UploadImageResponse = {
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
      shares: {},
      channels: [],
      groups: [],
      ims: [],
      has_rich_preview: false,
    },
  };
  const filesUploadCalls: Record<string, unknown>[] = [];
  mf.mock("POST@/api/files.upload", async (req) => {
    const formData = await req.clone().formData();
    const params: Record<string, unknown> = {};
    formData.forEach((value, key) => {
      params[key] = value;
    });
    filesUploadCalls.push(params);
    return new Response(JSON.stringify(dummyBody));
  });

  const res = await uploadPNGImageFile({
    apiToken: "DUMMY_TOKEN",
    base64Image: "RFVNTVlfSU1BR0U=", // base64 encoded "DUMMY_IMAGE"
    channels: "DUMMY_CHANNEL1,DUMMY_CHANNEL2",
    filename: "DUMMY_FILENAME",
    title: "DUMMY_TITLE",
  });

  assertEquals(filesUploadCalls.length, 1);
  assertEquals(filesUploadCalls[0].channels, "DUMMY_CHANNEL1,DUMMY_CHANNEL2");
  assertEquals(filesUploadCalls[0].filename, "DUMMY_FILENAME");
  assertEquals(filesUploadCalls[0].filetype, "png");
  assertEquals(filesUploadCalls[0].title, "DUMMY_TITLE");
  assertExists(filesUploadCalls[0].file);
  assertEquals(res, {
    ok: true,
    data: dummyBody,
  });
});
