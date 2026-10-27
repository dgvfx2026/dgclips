import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

const desktop = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(desktop);
const model = JSON.parse(await fs.readFile(path.join(desktop,"model-manifest.json"),"utf8"));
async function download(url, destination, expectedHash) {
  try {
    const present = await fs.stat(destination);
    if (present.isFile()) {
      if (!expectedHash) return;
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(destination)) hash.update(chunk);
      if (hash.digest("hex") === expectedHash) return;
    }
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
if (!uiOnly) await Promise.all(Object.entries(model.files).map(([name,hash]) => download(`https://huggingface.co/${model.repository}/resolve/${model.revision}/${name}`, path.join(desktop, "models",model.directory,name),hash)));
const publicDir = path.join(desktop, "ui/public");
await fs.mkdir(publicDir, { recursive: true });
await fs.copyFile(path.join(repo, "frontend/public/dgclips.svg"), path.join(publicDir, "dgclips.svg"));
await fs.cp(path.join(repo, "frontend/public/studio"), path.join(publicDir, "studio"), { recursive: true });
await fs.mkdir(path.join(publicDir, "fonts"), { recursive: true });
// These are the exact font files already used by the web studio.
for (const name of ["Geist", "Syne"]) {
  await fs.copyFile(path.join(desktop, "fonts", name + ".woff2"), path.join(publicDir, "fonts", name + ".woff2"));
}
for (const [source,name] of [['Manrope[wght].ttf','Manrope.ttf'],['Montserrat[wght].ttf','Montserrat.ttf'],['Anton-Regular.ttf','Anton-Regular.ttf'],['Lora[wght].ttf','Lora.ttf']]) await fs.copyFile(path.join(desktop,'fonts',source),path.join(publicDir,'fonts',name));
if (!uiOnly) {
  await fs.mkdir(path.join(desktop, "tools"), { recursive: true });
  await fs.copyFile(process.execPath, path.join(desktop, "tools/node.exe"));
}
console.log(uiOnly ? "Desktop UI assets ready." : "Desktop assets ready. The voice model is bundled; editorial weights are prepared on first use.");
