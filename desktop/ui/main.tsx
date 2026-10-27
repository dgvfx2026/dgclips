import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Clapperboard, Download, FolderOpen, Loader2, Monitor, RotateCcw, ShieldCheck, Upload, WandSparkles, X } from "lucide-react";
import { Workspace, type View } from "@/components/dgclips/workspace";
import { GlassMotion } from "@/components/dgclips/glass-motion";
import { Link, navigate } from "./adapters";
import { openProjects, saveClip } from "./bridge";
import { validateVideoSourceUrl } from "./upload";
import "@/app/globals.css";
import "@/components/dgclips/workspace.css";
import "@/components/dgclips/liquid-glass.css";
import "./desktop.css";

type Clip = { id: string; title: string; start: number; end: number; duration: number; text: string };
type Job = { id: string; source_title: string; status: string; stage: string; progress: number; clips: Clip[]; error: string | null };
type Status = { version: string; data_dir: string; model: string; model_ready: boolean; free_gb: number; selection: string };

function Workflow() {
  return <section className="dg-workflow-section"><div className="dg-section-heading"><div><h2>Seu próximo clipe, em três passos.</h2><p>Sem cadastro. Tudo acontece neste computador.</p></div></div><div className="dg-flow-grid desktop-flow">{[{ icon: Upload, title: "Traga seu vídeo", text: "Cole um link ou escolha um arquivo do computador." }, { icon: WandSparkles, title: "Deixe com o DGCLIPS", text: "A fala é transcrita e os trechos são sugeridos automaticamente." }, { icon: Download, title: "Pronto para publicar", text: "Assista aos resultados e salve os seus favoritos em MP4." }].map((step, index) => <article className="dg-flow-card" key={step.title}><span className="dg-flow-index">0{index+1}</span><span className="dg-flow-icon"><step.icon size={21}/></span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>;
}
function LocalSettings() {
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState(false);
  useEffect(() => { fetch("/api/desktop/status").then(r => { if (!r.ok) throw Error(); return r.json(); }).then(setStatus).catch(() => setError(true)); }, []);
  return <div className="dg-settings-grid"><section className="dg-settings-card"><span className="dg-settings-icon"><Monitor size={23}/></span><h2>Pronto neste computador</h2><p>O programa já inclui o necessário para criar seus clipes. Você não precisa de contas ou chaves de API.</p>{error ? <p role="alert">Não consegui consultar o programa. Feche e abra o DGCLIPS novamente.</p> : <dl><div><dt>Versão</dt><dd>{status?.version || "…"}</dd></div><div><dt>Transcrição</dt><dd>{status?.model_ready ? "Incluída e pronta" : "Verificando…"}</dd></div><div><dt>Processamento</dt><dd>Local · CPU</dd></div><div><dt>Espaço livre</dt><dd>{status?.free_gb || "…"} GB</dd></div></dl>}<Link href="/" className="dg-button dg-primary">Criar meus clipes <ArrowRight size={15}/></Link></section><section className="dg-settings-card"><span className="dg-settings-icon"><FolderOpen size={23}/></span><h2>Seus vídeos ficam com você</h2><p>Projetos, entradas e clipes ficam nesta pasta. Nenhum vídeo é enviado a serviços de IA.</p><code className="desktop-path">{status?.data_dir || "Carregando…"}</code><button className="dg-button dg-secondary" onClick={() => openProjects().catch(e => toast.error(e.message))}>Abrir pasta de projetos <FolderOpen size={15}/></button><p className="desktop-small">Escolha o disco D: no instalador. Para mover uma instalação existente, feche o programa e mova a pasta inteira do DGCLIPS, incluindo seus dados.</p></section><section className="dg-settings-card desktop-full"><span className="dg-settings-icon"><ShieldCheck size={23}/></span><h2>Como as sugestões funcionam</h2><p>O Whisper reconhece a fala. O DGCLIPS prioriza frases completas, trechos com mais fala e assuntos recorrentes, evitando cortes repetidos. São sugestões automáticas para você revisar; não há previsão de viralização. O enquadramento vertical recorta o centro do vídeo; escolha “Vertical · Vídeo completo” para preservar toda a imagem.</p><p>Links precisam de internet e podem ser bloqueados pelo próprio site. Nesses casos, envie o arquivo. Vídeos locais funcionam sem internet. O tempo depende da duração do vídeo e da capacidade do computador.</p></section></div>;
}
function LocalGuide() { return <><div className="dg-guide-hero"><span className="dg-guide-mark"><Clapperboard size={34}/></span><h2>Abra. Adicione.<br/><span>Receba seus clipes.</span></h2><p>Cole o link no início ou clique em Novo projeto para escolher um vídeo. Confirme “Gerar meus clipes”, acompanhe o progresso e salve os resultados.</p><Link className="dg-button dg-primary" href="/">Vamos criar <ArrowRight size={16}/></Link></div><Workflow/><div className="dg-tip"><ShieldCheck size={20}/><p>Use vídeos com fala clara. Se um link pedir login ou for bloqueado pelo site, escolha Enviar arquivo. Para vídeos locais, o modelo de transcrição já está incluído no programa.</p></div></>; }

function Project({ id }: { id: string }) {
  const [job, setJob] = useState<Job>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/tasks/${id}`).then(async r => { const data = await r.json(); if (!r.ok) throw Error(data.error || "Projeto não encontrado."); return data; }).then(data => { if (alive) { setJob(data); setError(""); } }).catch(e => { if (alive) setError(e.message); });
    void load();
    const timer = window.setInterval(load, 1500);
    return () => { alive = false; window.clearInterval(timer); };
  }, [id]);
  const active = job && ["queued", "processing"].includes(job.status);
  const action = async (type: "cancel" | "retry") => {
    setPending(true);
    try {
      const response = await fetch(`/api/tasks/${id}/${type}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (data.task_id) navigate(`/tasks/${data.task_id}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível concluir."); }
    finally { setPending(false); }
  };
  return <div className="dg-studio desktop-project"><GlassMotion view={id}/><header className="desktop-project-header"><Link href="/" className="dg-logo"><img src="/dgclips.svg" width="35" height="35" alt=""/><span>DG<span>CLIPS</span><i/></span></Link><span className="desktop-local-pill"><Monitor size={13}/> No seu computador</span><Link href="/projects" className="dg-button dg-secondary"><ArrowLeft size={15}/> Meus projetos</Link></header><main className="desktop-project-main"><div className="dg-page-heading"><div><p className="dg-eyebrow">DO SEU VÍDEO AO PRÓXIMO POST</p><h1>{job?.source_title || "Preparando seu projeto…"}</h1><p className="dg-subtitle">O DGCLIPS cuida do trabalho. Você escolhe os melhores resultados.</p></div></div>{error && <div className="dg-form-error" role="alert">{error} <button className="dg-button dg-secondary" onClick={() => window.location.reload()}>Tentar novamente</button></div>}{!job && !error && <div className="dg-empty"><Loader2 className="dg-spin"/>Carregando…</div>}{job && <section className="dg-settings-card desktop-progress" aria-live="polite"><div className="desktop-progress-title"><span className="dg-dialog-icon">{active ? <WandSparkles size={25} className="desktop-processing-icon"/> : job.status === "completed" ? <Check size={26}/> : <X size={26}/>}</span><div><h2>{job.stage}</h2><p>{active ? "Você pode navegar pelos seus projetos. Mantenha o programa aberto até terminar." : job.error || "Assista aos clipes abaixo e salve os que mais gostar."}</p></div><strong>{job.progress}%</strong></div><div className="desktop-progress-track" role="progressbar" aria-label="Progresso do vídeo" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${job.progress}%` }}/></div>{active ? <button className="desktop-cancel" disabled={pending} onClick={() => void action("cancel")}>Cancelar processamento</button> : job.status !== "completed" ? <button className="dg-button dg-secondary" disabled={pending} onClick={() => void action("retry")}><RotateCcw size={15}/>Tentar novamente</button> : <button className="dg-button dg-secondary" onClick={() => openProjects().catch(e => toast.error(e.message))}><FolderOpen size={15}/>Abrir pasta de projetos</button>}</section>}{!!job?.clips.length && <section><div className="dg-section-heading"><div><h2>Seus novos momentos <span className="desktop-count">{job.clips.length}</span></h2><p>Clipes em MP4, prontos para salvar. Revise as legendas antes de publicar.</p></div></div><div className="desktop-clips">{job.clips.map((clip, index) => <article className="dg-project-card desktop-clip" key={clip.id}><div className="desktop-video"><video controls playsInline preload="metadata" src={`/api/tasks/${id}/clips/${clip.id}/file`}><track kind="captions"/></video><span className="desktop-clip-number">0{index+1}</span></div><div className="desktop-clip-copy"><h3>{clip.title}</h3><p>{Math.round(clip.duration)} segundos · {Math.floor(clip.start/60)}:{String(Math.floor(clip.start%60)).padStart(2,"0")} do original</p><button className="dg-button dg-primary" onClick={() => saveClip(id, clip.id).then(saved => { if (saved) toast.success("Clipe salvo."); }).catch(() => toast.error("Não consegui salvar. Tente outra pasta."))}><Download size={16}/>Salvar clipe</button><details><summary>Ver transcrição deste trecho</summary><p>{clip.text}</p></details></div></article>)}</div></section>}<footer className="dg-footer"><span>DGCLIPS STUDIO · Seu conteúdo, sob seu controle.</span><Link href="/">Criar outro projeto <ArrowRight size={13}/></Link></footer></main></div>;
}
function App() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => { const update = () => setPath(window.location.pathname); window.addEventListener("popstate", update); return () => window.removeEventListener("popstate", update); }, []);
  const project = /^\/tasks\/([a-f0-9]{32})$/.exec(path);
  const views: Record<string, View> = { "/": "dashboard", "/projects": "projects", "/clips": "clips", "/templates": "templates", "/guide": "guide", "/workspace/settings": "setup", "/settings": "setup" };
  const quickCreate = async (url: string, template: string) => {
    if (validateVideoSourceUrl(url).error) throw Error("Cole um link válido do YouTube, Twitch ou Kick.");
    const response = await fetch("/api/tasks/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: { url }, caption_template: template, output_format: "vertical_fit", clip_length: "auto", add_subtitles: true }) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Não consegui iniciar este vídeo.");
    navigate(`/tasks/${data.task_id}`);
  };
  return <>{project ? <Project key={project[1]} id={project[1]}/> : <Workspace view={views[path] || "dashboard"} configured desktop quickCreate={quickCreate} settingsPanel={<LocalSettings/>} guidePanel={<LocalGuide/>} workflowPanel={<Workflow/>}/>}<Toaster theme="dark" richColors closeButton/></>;
}
createRoot(document.getElementById("root")!).render(<App/>);
