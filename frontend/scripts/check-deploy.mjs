import fs from "node:fs";
if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
const demo = process.env.DGCLIPS_DEMO === "true";
if (demo) {
  console.log("DGCLIPS: demonstração ativada. Nenhuma chave é necessária; o processamento real fica desativado.");
  process.exit(0);
}
const services = process.argv.includes("--services");
const required = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BACKEND_AUTH_SECRET", "APP_SETTINGS_ENCRYPTION_KEY", "NEXT_PUBLIC_APP_URL", "BETTER_AUTH_URL", ...(services ? ["BACKEND_DATABASE_URL", "REDIS_HOST", "REDIS_PASSWORD", "MEDIA_S3_BUCKET"] : ["NEXT_PUBLIC_API_URL"])];
let errors = 0;
for (const key of required) {
  const value = process.env[key]?.trim();
  if (!value || /replace-|your-project|your-domain|generate-|user:password/.test(value)) {
    console.error(`${key}: falta configurar um valor real.`); errors++;
  }
}
for (const key of ["BETTER_AUTH_SECRET", "BACKEND_AUTH_SECRET", "APP_SETTINGS_ENCRYPTION_KEY"]) {
  if (process.env[key] && process.env[key].length < 32) { console.error(`${key}: use pelo menos 32 caracteres.`); errors++; }
}
for (const key of ["NEXT_PUBLIC_APP_URL", "BETTER_AUTH_URL", ...(services ? [] : ["NEXT_PUBLIC_API_URL"])]) {
  try { if (new URL(process.env[key]).protocol !== "https:") throw new Error(); }
  catch { console.error(`${key}: use uma URL pública HTTPS válida.`); errors++; }
}
if (process.env.NEXT_PUBLIC_SELF_HOST !== "true") { console.error("NEXT_PUBLIC_SELF_HOST: use true para desativar a cobrança do projeto original."); errors++; }
if (process.env.NEXT_PUBLIC_APP_URL !== process.env.BETTER_AUTH_URL) { console.error("BETTER_AUTH_URL e NEXT_PUBLIC_APP_URL precisam ter a mesma origem."); errors++; }
console.log(errors ? `DGCLIPS: ${errors} ajuste(s) necessário(s). Nenhum segredo foi exibido.` : "DGCLIPS: variáveis locais verificadas. Confira também o servidor, o bucket e o CORS antes de publicar.");
process.exitCode = errors ? 1 : 0;
