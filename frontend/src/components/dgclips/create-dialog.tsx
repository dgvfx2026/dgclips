"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Captions, Link2, Loader2, ShieldCheck, Sparkles, Upload, WandSparkles } from "lucide-react";
import { uploadVideoFile, validateVideoSourceUrl, maxVideoUploadBytes, formatUploadLimit } from "@/lib/video-upload";
import { parseApiError, formatSupportMessage } from "@/lib/api-error";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { StudioUser } from "./workspace";

export function CreateDialog({ open, onOpenChange, demo, user, initialUrl, template, onDemo }: {
  open: boolean; onOpenChange: (value: boolean) => void; demo: boolean; user?: StudioUser;
  initialUrl: string; template: string; onDemo: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [tab, setTab] = useState("link");
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState("auto");
  const [format, setFormat] = useState("vertical");
  const [subtitles, setSubtitles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setUrl(initialUrl); setError(""); setStatus(""); } }, [open, initialUrl]);
  const pickFile = (value?: File) => {
    if (!value) return;
    if (!/\.(mp4|mov|webm|mkv|m4v)$/i.test(value.name)) { setError("Escolha um vídeo MP4, MOV, WebM, MKV ou M4V."); return; }
    if (value.size > maxVideoUploadBytes()) { setError(`O limite de envio é ${formatUploadLimit(maxVideoUploadBytes())}.`); return; }
    if (!value.size) { setError("O arquivo está vazio. Escolha outro vídeo."); return; }
    setFile(value); setError("");
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (demo || !user || busy) return;
    if (tab === "link") {
      const validation = validateVideoSourceUrl(url);
      if (validation.error) { setError("Use um link válido do YouTube, Twitch ou Kick. Transmissões ao vivo não são suportadas."); return; }
    } else if (!file) { setError("Escolha um vídeo para continuar."); return; }
    setBusy(true); setError("");
    try {
      setStatus(tab === "upload" ? "Enviando seu vídeo…" : "Preparando seu projeto…");
      const sourceUrl = tab === "upload" && file ? await uploadVideoFile(file, maxVideoUploadBytes()) : url.trim();
      setStatus("Iniciando o processamento…");
      const response = await fetch("/api/tasks/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: { url: sourceUrl, title: tab === "upload" ? file?.name.slice(0, 500) : null }, font_options: {}, caption_template: template, processing_mode: "fast", output_format: format, clip_length: duration, add_subtitles: subtitles, include_broll: false, cut_long_pauses: true, pause_threshold_ms: 1200, remove_filler_words: true, filtered_words: [] }),
      });
      if (!response.ok) throw new Error(formatSupportMessage(await parseApiError(response, "Não foi possível iniciar o projeto.")));
      const result = await response.json();
      if (typeof result.task_id !== "string" || !result.task_id) throw new Error("O servidor não retornou o identificador do projeto.");
      window.location.assign(`/tasks/${encodeURIComponent(result.task_id)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível conectar ao servidor."); setBusy(false); setStatus(""); }
  };
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value); }}><DialogContent className="dg-create-dialog"><span className="dg-dialog-icon"><WandSparkles size={24} /></span><DialogTitle>Uma ideia. Muitos clipes.</DialogTitle><DialogDescription>Adicione seu vídeo. A gente encontra os melhores momentos.</DialogDescription><form onSubmit={submit}>
    <div className="dg-source-tabs"><button type="button" aria-pressed={tab === "link"} className={tab === "link" ? "selected" : ""} onClick={() => { setTab("link"); setError(""); }} disabled={busy}><Link2 size={15} />Colar um link</button><button type="button" aria-pressed={tab === "upload"} className={tab === "upload" ? "selected" : ""} onClick={() => { setTab("upload"); setError(""); }} disabled={busy}><Upload size={15} />Enviar arquivo</button></div>
    {tab === "link" ? <label className="dg-field">Link do vídeo<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…" disabled={busy} /><small>YouTube, Twitch ou Kick · Vídeos gravados</small></label> : <div className={`dg-dropzone ${dragging ? "dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) pickFile(e.dataTransfer.files[0]); }}><Upload size={25} /><button type="button" onClick={() => input.current?.click()} disabled={busy}>{file ? file.name : "Escolha um vídeo ou arraste aqui"}</button><small>{file ? `${(file.size / 1000000).toFixed(1)} MB · Clique para trocar` : `MP4, MOV, WebM, MKV · Até ${formatUploadLimit(maxVideoUploadBytes())}`}</small><input ref={input} type="file" accept=".mp4,.mov,.webm,.mkv,.m4v" className="sr-only" aria-label="Escolher vídeo" disabled={busy} onChange={(e) => pickFile(e.target.files?.[0])} /></div>}
    <div className="dg-form-row"><label className="dg-field">Duração dos clipes<select value={duration} onChange={(e) => setDuration(e.target.value)} disabled={busy}><option value="auto">Automática · Escolhida pela IA</option><option value="short">Curtos · 15–30 segundos</option><option value="medium">Médios · 30–60 segundos</option><option value="long">Longos · 60–90 segundos</option></select></label><label className="dg-field">Formato<select value={format} onChange={(e) => setFormat(e.target.value)} disabled={busy}><option value="vertical">Vertical · 9:16</option><option value="vertical_fit">Vertical · Vídeo completo</option><option value="original">Formato original</option></select></label></div>
    <label className="dg-checkbox"><input type="checkbox" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)} disabled={busy} /><span><strong>Legendas automáticas</strong><small>Cada palavra no ritmo do seu conteúdo.</small></span><Captions size={20} /></label>
    {error && <p role="alert" className="dg-form-error">{error}</p>}
    {demo ? <div className="dg-demo-form-note"><Sparkles size={17} /><p>Você está no modo demonstração. Conecte seu servidor e suas chaves de IA para processar vídeos reais.</p></div> : !user ? <p className="dg-demo-form-note">Entre na sua conta para iniciar um projeto.</p> : null}
    <div className="dg-dialog-bottom"><span><ShieldCheck size={13} />Seu vídeo. Seu controle.</span>{demo ? <button className="dg-button dg-primary" type="button" onClick={onDemo}>Explorar um exemplo<ArrowRight size={16} /></button> : !user ? <Link href="/sign-in" className="dg-button dg-primary">Entrar para criar<ArrowRight size={16} /></Link> : <button className="dg-button dg-primary" type="submit" disabled={busy}>{busy ? <Loader2 size={16} className="dg-spin" /> : <Sparkles size={16} />}{busy ? status : "Gerar meus clipes"}</button>}</div>
  </form></DialogContent></Dialog>;
}
