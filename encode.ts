import { encode } from "std/encoding/base64.ts";

const path = Deno.args[0];
if (!path) {
  console.log("file path is required");
  Deno.exit(1);
}
const file = await Deno.readTextFile(path);
const encoded = new TextEncoder().encode(JSON.stringify(JSON.parse(file)));
console.log(encode(encoded));
