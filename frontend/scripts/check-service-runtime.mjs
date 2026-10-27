import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Check the actual build output: an Edge function prevents deployment of this
// service because the frontend declares a private backend binding.
const manifest = JSON.parse(readFileSync(resolve(".next/server/middleware-manifest.json"), "utf8"));
const edgeFunctions = Object.keys(manifest.functions ?? {});
if (edgeFunctions.length) {
  throw new Error(`Vercel service bindings require Node.js functions. Change these routes from Edge to Node.js: ${edgeFunctions.join(", ")}`);
}
console.log("DGCLIPS: build functions are compatible with private Vercel service bindings.");
