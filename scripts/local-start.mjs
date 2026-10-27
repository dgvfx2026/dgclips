import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const settingsFile = resolve(root, ".env.dgclips-local");
const mode = process.argv[2] || "--start";
const modes = ["--start", "--prepare", "--check", "--stop", "--logs"];
if (!modes.includes(mode)) {
  console.error("Opções: --start, --prepare, --check, --stop, --logs");
  process.exit(1);
}
const secrets = ["LOCAL_DATABASE_PASSWORD", "LOCAL_REDIS_PASSWORD", "LOCAL_AUTH_SECRET", "LOCAL_BACKEND_SECRET", "LOCAL_SETTINGS_SECRET"];

function prepare() {
  if (!existsSync(settingsFile)) {
    const content = ["# Configuração privada do DGCLIPS Local. Não compartilhe este arquivo.", ...secrets.map((key) => `${key}=${randomBytes(32).toString("hex")}`), "LOCAL_OLLAMA_MODEL=qwen3:4b", "LOCAL_WHISPER_MODEL=small", "LOCAL_DISABLE_SIGN_UP=false", ""].join("\n");
    writeFileSync(settingsFile, content, { flag: "wx", mode: 0o600 });
    console.log("Configuração local criada. Os valores privados não serão exibidos.");
  }
  const settings = new Map(readFileSync(settingsFile, "utf8").split(/\r?\n/).filter((line) => line.includes("=") && !line.startsWith("#")).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  const missing = secrets.filter((key) => !/^[a-f0-9]{64}$/.test(settings.get(key) || ""));
  if (missing.length) throw new Error(`Configuração local inválida: ${missing.join(", ")}. Preserve o arquivo original para continuar acessando seus dados.`);
  console.log("Configuração local verificada.");
}

function docker(args, capture = false) {
  const result = spawnSync("docker", args, { cwd: root, stdio: capture ? "pipe" : "inherit", encoding: "utf8", windowsHide: true });
  if (result.error) throw new Error("Docker não está disponível. Instale e abra o Docker Desktop com WSL 2 antes de iniciar o DGCLIPS.");
  if (result.status !== 0) throw new Error(capture ? "O Docker Desktop não está pronto. Abra o aplicativo e aguarde o motor Linux iniciar." : "O Docker não concluiu a operação. Confira a mensagem acima e se o Docker Desktop está aberto.");
  return (result.stdout || "").trim();
}
const compose = ["compose", "--env-file", settingsFile, "--file", resolve(root, "docker-compose.local.yml")];

try {
  if (mode === "--prepare") { prepare(); process.exit(0); }
  if (docker(["info", "--format", "{{.OSType}}"], true) !== "linux") throw new Error("Selecione Linux containers no Docker Desktop e habilite o backend WSL 2.");
  docker(["compose", "version"]);
  prepare();
  docker([...compose, "config", "--quiet"]);
  if (mode === "--check") { console.log("Docker e configuração disponíveis. A GPU e os modelos serão verificados na primeira inicialização."); process.exit(0); }
  if (mode === "--stop") { docker([...compose, "stop"]); console.log("DGCLIPS parado. Seus vídeos e modelos foram preservados."); process.exit(0); }
  if (mode === "--logs") { docker([...compose, "logs", "--tail", "80", "backend", "worker", "ollama", "whisper-model"]); process.exit(0); }
  console.log("Preparando o DGCLIPS Local. A primeira vez baixa programas e modelos de IA e pode demorar bastante.");
  console.log("Banco, fila, vídeos e IA ficam no Docker deste computador. O acesso será em http://localhost:3117.");
  docker([...compose, "up", "--detach", "--build", "--wait", "--wait-timeout", "1800"]);
  console.log("DGCLIPS disponível: http://localhost:3117 — crie sua conta local e teste primeiro um vídeo curto.");
  if (process.platform === "win32") {
    const browser = spawn("cmd.exe", ["/c", "start", "", "http://localhost:3117"], { stdio: "ignore", windowsHide: true });
    browser.on("error", () => {});
    browser.unref();
  }
} catch (error) { console.error(`\n${error.message}`); process.exitCode = 1; }
