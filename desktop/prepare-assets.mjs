import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const desktop = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(desktop);
const modelRevision = "536b0662742c02347bc0e980a01041f333bce120";
const modelHash = "3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671";
async function download(url, destination, expectedHash) {
  try {
    const present = await fs.readFile(destination);
    if (!expectedHash || createHash("sha256").update(present).digest("hex") === expectedHash) return;
  } catch { /* Download absent or incomplete build assets. */ }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  const temporary = destination + ".partial";
  const file = await fs.open(temporary, "w");
  const hash = createHash("sha256");
  let count = 0, reported = 0;
  try {
    for await (const value of response.body) {
      hash.update(value);
      await file.write(value);
      count += value.length;
      if (count - reported >= 100_000_000) { console.log(`${path.basename(destination)}: ${Math.round(count/1e6)} MB`); reported = count; }
    }
  } finally { await file.close(); }
  if (expectedHash && hash.digest("hex") !== expectedHash) throw new Error(`Checksum mismatch: ${destination}`);
  await fs.rename(temporary, destination);
  console.log(`Ready: ${path.basename(destination)}`);
}
const uiOnly = process.argv.includes("--ui-only");
if (!uiOnly) await Promise.all(["config.json", "model.bin", "tokenizer.json", "vocabulary.txt"].map(name => download(`https://huggingface.co/Systran/faster-whisper-small/resolve/${modelRevision}/${name}`, path.join(desktop, "models/whisper-small", name), name === "model.bin" ? modelHash : undefined)));
const publicDir = path.join(desktop, "ui/public");
await fs.mkdir(publicDir, { recursive: true });
await fs.copyFile(path.join(repo, "frontend/public/dgclips.svg"), path.join(publicDir, "dgclips.svg"));
await fs.cp(path.join(repo, "frontend/public/studio"), path.join(publicDir, "studio"), { recursive: true });
await fs.mkdir(path.join(publicDir, "fonts"), { recursive: true });
// These are the exact font files already used by the web studio.
for (const name of ["Geist", "Syne"]) {
  await fs.copyFile(path.join(desktop, "fonts", name + ".woff2"), path.join(publicDir, "fonts", name + ".woff2"));
}
if (!uiOnly) {
  await fs.mkdir(path.join(desktop, "tools"), { recursive: true });
  await fs.copyFile(process.execPath, path.join(desktop, "tools/node.exe"));
  await fs.writeFile(path.join(desktop, "model-manifest.json"), JSON.stringify({ repository: "Systran/faster-whisper-small", revision: modelRevision, sha256: modelHash }, null, 2));
}
console.log(uiOnly ? "Desktop UI assets ready." : "Desktop assets ready. No model download is needed at runtime.");
