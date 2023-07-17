import { decode as base64Decode } from "std/encoding/base64.ts";
import { create } from "djwt/mod.ts";

// base64 encoded google-service-account.json
const GOOGLE_CREDENTIALS = Deno.env.get("GOOGLE_CREDENTIALS");
const AUTH_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

export const authenticate = async () => {
  if (!GOOGLE_CREDENTIALS) {
    throw new Error("GOOGLE_CREDENTIALS is not set");
  }
  const credentials = JSON.parse(new TextDecoder().decode(
    base64Decode(GOOGLE_CREDENTIALS!),
  ));

  // Create the JWT
  const header = {
    alg: "RS256",
    typ: "JWT",
  } as const;
  const now = Date.now();
  const payload = {
    iss: credentials.client_email,
    scope: AUTH_SCOPES.join(" "),
    aud: AUTH_ENDPOINT,
    exp: Math.floor(now / 1000) + 3600,
    iat: Math.floor(now / 1000),
  };
  const privateKey = credentials.private_key.replace(
    /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g,
    "",
  ).trim();
  const key = await crypto.subtle.importKey(
    "pkcs8",
    base64Decode(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const jwt = await create(header, payload, key);

  const res = await fetch(AUTH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error("googleapis auth failed", {
      cause: { body, status: res.status },
    });
  }
  const data = await res.json();
  return data;
};

export const getSpreadSheetValues = async (
  { token, spreadsheetId }: { token: string; spreadsheetId: string },
) => {
  const range = "A2:D";

  const sheetsResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    { headers: { "Authorization": `Bearer ${token}` } },
  );
  const sheetsData = await sheetsResponse.json();
  return sheetsData;
};
