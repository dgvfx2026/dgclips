import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn, spawnSync } from "node:child_process";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = "D:\\DGCLIPS";
const installers = path.join(target, "Installers");
const desktop = path.join(target, "DockerDesktop");
const data = path.join(target, "DockerData");
const app = path.join(target, "App");
const installer = path.join(installers, "DockerDesktopInstaller.exe");
const officialUrl = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe";

if (process.argv.includes("--help")) {
  console.log("Instalação interativa em D:\\DGCLIPS: Docker Desktop, dados/modelos/vídeos e aplicativo. Requer execução como administrador. Não aceita os termos nem reinicia o Windows automaticamente.");
  process.exit(0);
}

function command(program, args, capture = false) {
  const result = spawnSync(program, args, { stdio: capture ? "pipe" : "inherit", encoding: "utf8", windowsHide: capture });
  if (result.error) throw new Error(`Não foi possível executar ${program}.`);
  return result;
}
const psQuote = (value) => `'${value.replace(/'/g, "''")}'`;
function validSignature(file) {
  const result = command("powershell.exe", ["-NoProfile", "-Command", `$signature = Get-AuthenticodeSignature -LiteralPath ${psQuote(file)}; if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Docker') { exit 1 }; exit 0`], true);
  return result.status === 0;
}

try {
  if (process.platform !== "win32") throw new Error("Este instalador é para Windows com disco D:.");
  if (process.arch !== "x64") throw new Error("Esta configuração foi preparada para Windows x64 com NVIDIA.");
  const admin = command("powershell.exe", ["-NoProfile", "-Command", "$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent()); if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 }; exit 1"], true);
  if (admin.status !== 0) throw new Error("Feche esta janela. Clique com o botão direito em Instalar-DGCLIPS-no-D.cmd e escolha Executar como administrador.");
  if (!fs.existsSync("D:\\")) throw new Error("O disco D: não está disponível.");
  const disk = fs.statfsSync("D:\\");
  if (disk.bavail * disk.bsize < 40 * 1024 ** 3) throw new Error("Reserve pelo menos 40 GB livres no D: para a instalação inicial e seus primeiros vídeos.");

  console.log("Destino: D:\\DGCLIPS. Componentes do próprio Windows/WSL podem permanecer no C:.");
  for (const folder of [installers, desktop, data]) fs.mkdirSync(folder, { recursive: true });
  if (!fs.existsSync(path.join(app, "Iniciar-DGCLIPS.cmd"))) {
    if (fs.existsSync(app) && fs.readdirSync(app).length) throw new Error("A pasta D:\\DGCLIPS\\App já contém arquivos. Nenhum arquivo será substituído; confira o conteúdo antes de continuar.");
    const skip = new Set([".git", "node_modules", ".next", ".venv", "graphify-out", "__pycache__", "coverage", "playwright-report", "test-results"]);
    fs.cpSync(project, app, { recursive: true, dereference: false, filter: (source) => {
      const relative = path.relative(project, source);
      const parts = relative.split(path.sep);
      if (parts.some((part) => skip.has(part))) return false;
      if (parts.some((part) => part.startsWith(".env") && part !== ".env.example")) return false;
      if (relative.startsWith(path.join("frontend", "src", "generated"))) return false;
      return !fs.lstatSync(source).isSymbolicLink();
    } });
    console.log("Aplicativo copiado para D:\\DGCLIPS\\App, sem dependências de desenvolvimento ou arquivos privados da instalação anterior.");
  } else console.log("Aplicativo existente preservado em D:\\DGCLIPS\\App.");

  if (!fs.existsSync(installer) || !validSignature(installer)) {
    console.log("Baixando o instalador oficial do Docker Desktop...");
    const response = await fetch(officialUrl);
    if (!response.ok || !response.body) throw new Error(`Falha no download oficial: HTTP ${response.status}.`);
    const partial = `${installer}.partial`;
    let received = 0;
    let reported = 0;
    const progress = new Transform({ transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received - reported >= 100 * 1024 ** 2) { console.log(`Download: ${Math.round(received / 1024 ** 2)} MB`); reported = received; }
      callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), progress, fs.createWriteStream(partial));
    if (!validSignature(partial)) throw new Error("A assinatura digital do instalador não foi validada como Docker. Ele não será executado.");
    fs.copyFileSync(partial, installer);
  }
  console.log("Assinatura digital do instalador oficial validada.");

  console.log("Preparando WSL 2. Confirme as telas do Windows quando necessário.");
  const wslVersion = command("wsl.exe", ["--version"], true);
  const versionText = `${wslVersion.stdout || ""}`.replace(/\0/g, "");
  const version = versionText.match(/(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number);
  const currentWsl = version && (version[0] > 2 || (version[0] === 2 && (version[1] > 1 || (version[1] === 1 && version[2] >= 5))));
  const wsl = currentWsl ? { status: 0 } : command("wsl.exe", version ? ["--update", "--web-download"] : ["--install", "--no-distribution", "--web-download"]);
  if (![0, 3010].includes(wsl.status)) throw new Error("O Windows não concluiu a preparação do WSL. Confira a mensagem acima antes de instalar o Docker.");
  console.log("Instalando Docker Desktop e configurando o armazenamento no D:...");
  const installation = command(installer, ["install", `--installation-dir=${desktop}`, `--wsl-default-data-root=${data}`, "--backend=wsl-2", "--no-windows-containers"]);
  if (![0, 3010].includes(installation.status)) throw new Error("O instalador do Docker não concluiu a operação. Confira a mensagem na tela.");

  const reboot = command("powershell.exe", ["-NoProfile", "-Command", "if ((Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') -or (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired')) { exit 1 }; exit 0"], true);
  console.log("Programas: D:\\DGCLIPS\\DockerDesktop | Dados grandes: D:\\DGCLIPS\\DockerData | Aplicativo: D:\\DGCLIPS\\App");
  if (wsl.status === 3010 || installation.status === 3010 || reboot.status !== 0) {
    console.log("O Windows precisa ser reiniciado. Salve seus trabalhos e reinicie quando puder. Depois, abra Docker Desktop e aceite os termos pessoalmente.");
  } else {
    const binary = path.join(desktop, "Docker Desktop.exe");
    if (fs.existsSync(binary)) { const ui = spawn(binary, [], { detached: true, stdio: "ignore", windowsHide: false }); ui.on("error", () => {}); ui.unref(); }
    console.log("No Docker Desktop, leia e aceite os termos pessoalmente para iniciar o motor Linux.");
  }
  console.log("Depois de o Docker estar pronto, abra D:\\DGCLIPS\\App\\Iniciar-DGCLIPS.cmd. A primeira execução baixa os modelos de IA e prepara os dados no D:.");
} catch (error) { console.error(`\n${error.message}`); process.exitCode = 1; }
