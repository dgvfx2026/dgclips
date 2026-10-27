import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronRight, Film, Image, Link2, Loader2, ScanFace, ShieldCheck, SlidersHorizontal, Sparkles, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { CreateDialogProps } from '@/components/dgclips/create-dialog';
import { uploadVideoFile, validateVideoSourceUrl } from './upload';
import { navigate } from './adapters';
import presets from '../caption-presets.json';

export type Rect = { x: number; y: number; w: number; h: number };
export type Preferences = { clip_count: number | 'auto'; clip_length: string; editorial_focus: string; editorial_brief: string; layout: string; caption_template: string; add_subtitles: boolean; caption_position: string; caption_scale: number; caption_color: string | null; camera_share: number; resolution: string };
export const defaultPreferences: Preferences = { clip_count: 10, clip_length: 'auto', editorial_focus: 'balanced', editorial_brief: '', layout: 'fill', caption_template: 'tiktok', add_subtitles: true, caption_position: 'auto', caption_scale: 1, caption_color: null, camera_share: .32, resolution: '1080' };
type Source = { id: string; title: string; width: number; height: number; duration: number; status: string; stage: string; progress: number; error?: string; camera_rect?: Rect | null; content_rect?: Rect };
const full: Rect = { x: 0, y: 0, w: 1, h: 1 };
const presetFor = (id: string) => presets.find(preset => preset.id === id) || presets[0];

export async function savePreferences(preferences: Preferences) {
  const response = await fetch('/api/desktop/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preferences) });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Não consegui guardar suas preferências.');
  return data as Preferences;
}

function CaptionSample({ options }: { options: Preferences }) {
  const preset = presetFor(options.caption_template);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setActive(value => (value+1)%4), 550);
    return () => window.clearInterval(timer);
  }, []);
  const words = ['uma', 'boa', 'ideia', 'conecta.'];
  const react = options.layout.startsWith('react_');
  const y = ({ upper: .23, middle: .52, lower: .76 } as Record<string, number>)[options.caption_position] || (options.caption_position === 'seam' && react ? options.layout === 'react_top' ? options.camera_share : 1-options.camera_share : options.layout === 'react_top' ? .59 : options.layout === 'react_bottom' ? .46 : .73);
  return options.add_subtitles ? <div aria-hidden className={`studio-caption-sample motion-${preset.motion} surface-${preset.surface}`} style={{ top: `${y*100}%`, fontFamily: `${preset.font}Caption, sans-serif`, fontSize: `${preset.size*288*options.caption_scale}px`, fontWeight: preset.weight ? 800 : 500, textTransform: preset.case === 'upper' ? 'uppercase' : 'none', '--caption-accent': options.caption_color || preset.accent } as React.CSSProperties}>{(preset.motion === 'word_pop' ? [words[active]] : words).map((word, index) => <span key={word} className={index === active && preset.motion !== 'fade' ? 'is-active' : ''}>{word} </span>)}</div> : null;
}

function Cover({ source, region, aspect }: { source: Source; region: Rect; aspect: number }) {
  let { x, y, w, h } = region;
  const sourceAspect = source.width / source.height;
  if (w/h*sourceAspect > aspect) { const next = h*aspect/sourceAspect; x += (w-next)/2; w = next; }
  else { const next = w*sourceAspect/aspect; y += (h-next)/2; h = next; }
  return <img alt="" draggable={false} src={`/api/desktop/sources/${source.id}/frame`} style={{ position: 'absolute', width: `${100/w}%`, height: `${100/h}%`, maxWidth: 'none', left: `${-100*x/w}%`, top: `${-100*y/h}%` }}/>;
}

function Contain({ source, region }: { source: Source; region: Rect }) {
  const aspect = region.w*source.width/(region.h*source.height);
  const target = 9/16;
  return <div style={{ position:'absolute', width:`${Math.min(1,aspect/target)*100}%`, height:`${Math.min(1,target/aspect)*100}%`, left:'50%', top:'50%', transform:'translate(-50%,-50%)', overflow:'hidden' }}><Cover source={source} region={region} aspect={aspect}/></div>;
}

function OutputPreview({ source, camera, content, options }: { source?: Source; camera?: Rect; content: Rect; options: Preferences }) {
  const react = options.layout.startsWith('react_');
  const panel = (kind: 'camera' | 'content') => {
    const share = kind === 'camera' ? options.camera_share : 1-options.camera_share;
    return <div key={kind} className={`studio-output-panel ${kind}`} style={{ height: `${share*100}%` }}>{source && (kind !== 'camera' || camera) ? <Cover source={source} region={kind === 'camera' ? camera! : content} aspect={9/16/share}/> : kind === 'camera' ? <Camera size={25}/> : <Film size={30}/>}<span>{kind === 'camera' ? 'CÂMERA' : 'CONTEÚDO'}</span></div>;
  };
  return <div className={`studio-output-preview ${options.layout === 'original' ? 'is-original' : ''}`} style={options.layout === 'original' && source ? { height: 240*source.height/source.width } : undefined} aria-label="Prévia do enquadramento final">{react ? options.layout === 'react_top' ? [panel('camera'), panel('content')] : [panel('content'), panel('camera')] : <div className="studio-output-panel whole">{source ? options.layout === 'fit' ? <><div style={{position:'absolute',inset:-10,filter:'blur(7px)'}}><Cover source={source} region={full} aspect={9/16}/></div><Contain source={source} region={content}/></> : options.layout === 'original' ? <img alt="" src={`/api/desktop/sources/${source.id}/frame`} style={{ width: '100%', height: '100%', objectFit: 'contain' }}/> : <Cover source={source} region={content} aspect={9/16}/> : <div className="studio-preview-empty"><Film size={32}/><span>SEU PRÓXIMO MOMENTO</span></div>}</div>}<CaptionSample options={options}/><span className="studio-output-ratio">{options.layout === 'original' ? 'ORIGINAL' : '9:16'} · PRÉVIA</span></div>;
}

function FrameEditor({ source, camera, content, setCamera, setContent, options }: { source: Source; camera?: Rect; content: Rect; setCamera: (rect: Rect) => void; setContent: (rect: Rect) => void; options: Preferences }) {
  const react = options.layout.startsWith('react_');
  const [area, setArea] = useState<'camera' | 'content'>(react ? 'camera' : 'content');
  const drag = useRef<{ x: number; y: number; before?: Rect } | null>(null);
  const selected = area === 'camera' ? camera : content;
  const setSelected = (value: Rect) => area === 'camera' ? setCamera(value) : setContent(value);
  const position = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX-bounds.left)/bounds.width)), y: Math.max(0, Math.min(1, (event.clientY-bounds.top)/bounds.height)) };
  };
  useEffect(() => { setArea(react ? 'camera' : 'content'); }, [react]);
  return <div className="studio-frame-editor"><div className="studio-frame-tools"><div className="dg-tabs">{react && <button type="button" aria-pressed={area === 'camera'} className={area === 'camera' ? 'selected' : ''} onClick={() => setArea('camera')}><Camera size={13}/>Câmera</button>}<button type="button" aria-pressed={area === 'content'} className={area === 'content' ? 'selected' : ''} onClick={() => setArea('content')}><Film size={13}/>Conteúdo</button></div>{react && source.camera_rect && <button type="button" className="studio-auto-camera" onClick={() => { setCamera(source.camera_rect!); setArea('camera'); }}><ScanFace size={14}/>Sugestão de câmera</button>}</div><p className="studio-frame-hint">Arraste sobre a imagem para marcar a área {area === 'camera' ? 'da câmera' : 'do conteúdo'}. Confira o resultado abaixo.</p><div className="studio-source-frame" style={{ aspectRatio: source.width/source.height }} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const point = position(event); drag.current = { ...point, before: selected }; }} onPointerMove={event => { if (!drag.current) return; const point = position(event); const x = Math.min(drag.current.x, point.x), y = Math.min(drag.current.y, point.y); const w = Math.abs(point.x-drag.current.x), h = Math.abs(point.y-drag.current.y); if (w >= .04 && h >= .04) setSelected({ x, y, w, h }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><img alt="Quadro do vídeo original para selecionar o enquadramento" src={`/api/desktop/sources/${source.id}/frame`} draggable={false}/>{[{ value: content, label: 'CONTEÚDO', name: 'content' }, ...(react && camera ? [{ value: camera, label: 'CÂMERA', name: 'camera' }] : [])].map(({ value, label, name }) => <span key={name} className={`studio-crop-box ${name} ${area === name ? 'active' : ''}`} style={{ left: `${value.x*100}%`, top: `${value.y*100}%`, width: `${value.w*100}%`, height: `${value.h*100}%` }}><b>{label}</b><i/><i/><i/><i/></span>)}</div><div className="studio-frame-bottom"><div><h4>{area === 'camera' ? 'Área da câmera' : 'Área do conteúdo'}</h4><div className="studio-rect-fields">{(['x', 'y', 'w', 'h'] as const).map((key, i) => <label key={key}>{['X', 'Y', 'Largura', 'Altura'][i]}<input type="number" min={key === 'w' || key === 'h' ? 4 : 0} max="100" step="1" value={Math.round((selected?.[key] || 0)*100)} onChange={event => { if (!selected) return; const value = Math.max(0, Math.min(1, Number(event.target.value)/100)); const next = { ...selected, [key]: value }; if (next.w >= .04 && next.h >= .04 && next.x+next.w <= 1.001 && next.y+next.h <= 1.001) setSelected(next); }}/></label>)}</div>{area === 'content' ? <button className="studio-inline-action" type="button" onClick={() => setContent(full)}>Usar toda a imagem como origem</button> : <div className="studio-camera-presets">{[{ name: 'Canto esquerdo', value: { x: .02, y: .04, w: .3, h: .3 } }, { name: 'Canto direito', value: { x: .68, y: .04, w: .3, h: .3 } }, { name: 'Direita ao centro', value: { x: .76, y: .28, w: .23, h: .24 } }].map(preset => <button key={preset.name} type="button" onClick={() => setCamera(preset.value)}>{preset.name}</button>)}</div>}<p className="studio-frame-hint">Cada painel preenche seu espaço sem esticar a imagem. O recorte central é mostrado na prévia.</p></div><OutputPreview source={source} camera={camera} content={content} options={options}/></div></div>;
}

export function CaptionGallery({ preferences, onChange }: { preferences: Preferences; onChange: (preferences: Preferences) => void }) {
  return <><div className="studio-caption-grid">{presets.map(preset => <article key={preset.id} className={`dg-template-card ${preferences.caption_template === preset.id ? 'chosen' : ''}`}><div className="studio-gallery-preview"><div className="studio-gallery-portrait"/><CaptionSample options={{ ...preferences, caption_template: preset.id, caption_color: null, caption_position: 'middle', layout: 'fill', add_subtitles: true }}/><span className="studio-preview-label">PRÉVIA DE ESTILO</span></div><div className="dg-template-info"><div><h3>{preset.name}</h3><p>{preset.description}</p></div><button className={`dg-button ${preferences.caption_template === preset.id ? 'dg-primary' : 'dg-secondary'}`} onClick={() => onChange({ ...preferences, caption_template: preset.id, caption_color: null })}>{preferences.caption_template === preset.id ? <><Check size={14}/>Selecionado</> : 'Usar estilo'}</button></div></article>)}</div><div className="dg-tip"><Sparkles size={18}/><p>O estilo será usado nos próximos cortes. Na criação, você também pode ajustar cor, tamanho e posição. As prévias usam texto ilustrativo.</p></div></>;
}

export function StudioCreate(props: CreateDialogProps & { preferences: Preferences; onPreferences: (preferences: Preferences) => void }) {
  const { open, onOpenChange, initialUrl, initialTab, preferences, onPreferences } = props;
  const [options, setOptions] = useState(preferences);
  const [tab, setTab] = useState(initialTab || 'link');
  const [url, setUrl] = useState(initialUrl);
  const [file, setFile] = useState<File>();
  const [uploaded, setUploaded] = useState<string>();
  const [prepared, setPrepared] = useState<Source>();
  const [recent, setRecent] = useState<Source[]>([]);
  const [camera, setCamera] = useState<Rect>();
  const [content, setContent] = useState<Rect>(full);
  const [busy, setBusy] = useState('');
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const pendingSource = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  const react = options.layout.startsWith('react_');
  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl); setTab(initialTab || 'link'); setOptions(preferences); setError(''); setPrepared(undefined); setCamera(undefined); setContent(full); setBusy(''); setStage(''); setFile(undefined); setUploaded(undefined);
    fetch('/api/desktop/sources').then(response => response.json()).then(data => setRecent(data.sources || [])).catch(() => setRecent([]));
    // Capture the preferences at opening; editing the form does not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialUrl, initialTab]);
  const change = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setOptions(previous => ({ ...previous, [key]: value }));
  const close = () => {
    if (busy === 'create') return;
    generation.current++;
    if (pendingSource.current) void fetch(`/api/desktop/sources/${pendingSource.current}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    pendingSource.current = undefined;
    onOpenChange(false);
  };
  const sourceUrl = async () => {
    if (tab === 'upload') {
      if (!file) throw Error('Escolha um vídeo do computador.');
      if (file.size > 8_000_000_000 || !file.size) throw Error('Escolha um arquivo de vídeo não vazio, de até 8 GB.');
      if (uploaded) return uploaded;
      setStage('Copiando seu vídeo para o estúdio…');
      const value = await uploadVideoFile(file);
      setUploaded(value);
      return value;
    }
    if (validateVideoSourceUrl(url).error) throw Error('Cole um link válido do YouTube, Twitch ou Kick.');
    return url.trim();
  };
  const useSource = (source: Source) => { setPrepared(source); setCamera(source.camera_rect || undefined); setContent(source.content_rect || full); setError(''); };
  const prepare = async () => {
    setBusy('preview'); setError('');
    const attempt = ++generation.current;
    try {
      const value = await sourceUrl();
      const response = await fetch('/api/desktop/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: value, title: file?.name }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      pendingSource.current = data.source_id;
      while (generation.current === attempt) {
        const result = await fetch(`/api/desktop/sources/${data.source_id}`).then(async response => { const source = await response.json(); if (!response.ok) throw Error(source.error || 'Não consegui consultar a prévia.'); return source; }) as Source;
        if (result.status === 'ready') { useSource(result); pendingSource.current = undefined; break; }
        if (result.status === 'failed') throw Error(result.error || 'Não consegui preparar a prévia.');
        setStage(`${result.stage || 'Preparando a prévia'}${result.progress ? ` · ${result.progress}%` : ''}`);
        await new Promise(resolve => window.setTimeout(resolve, 900));
      }
    } catch (cause) { if (generation.current === attempt) setError(cause instanceof Error ? cause.message : 'Não consegui preparar este vídeo.'); }
    finally { if (generation.current === attempt) { setBusy(''); setStage(''); } }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (react && !prepared) { await prepare(); return; }
    if (react && !camera) { setError('Marque a área da câmera na prévia ou escolha uma das posições sugeridas.'); return; }
    setBusy('create'); setError('');
    try {
      const value = prepared ? `prepared:${prepared.id}` : await sourceUrl();
      setStage('Iniciando a curadoria do seu vídeo…');
      const response = await fetch('/api/tasks/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...options, camera_rect: camera, content_rect: content, source: { url: value, title: prepared?.title || file?.name } }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Não consegui iniciar este vídeo.');
      onPreferences(options);
      onOpenChange(false);
      navigate(`/tasks/${result.task_id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não consegui iniciar o processamento.'); }
    finally { setBusy(''); setStage(''); }
  };
  return <Dialog open={open} onOpenChange={value => { if (!value) close(); }}><DialogContent showCloseButton={false} className="dg-create-dialog studio-create"><button className="dg-modal-close" type="button" disabled={busy === 'create'} onClick={close} aria-label="Fechar"><X size={18}/></button><div className="studio-create-heading"><span className="dg-dialog-icon"><SlidersHorizontal size={24}/></span><div><p className="dg-eyebrow">SEU CONTEÚDO. SUA DIREÇÃO.</p><DialogTitle>Cortes com intenção.</DialogTitle><DialogDescription>Escolha o foco, o enquadramento e a identidade. O DGCLIPS cuida do resto.</DialogDescription></div></div><form onSubmit={submit}><div className="studio-create-grid"><div className="studio-create-controls"><div className="studio-control-label"><b>01</b><h3>Traga seu vídeo</h3></div>{prepared ? <div className="studio-ready-source"><Check size={18}/><div><strong>{prepared.title}</strong><small>{Math.round(prepared.duration/60)} min · Prévia preparada</small></div><button type="button" onClick={() => { setPrepared(undefined); setCamera(undefined); setContent(full); }}>Trocar</button></div> : <><div className="dg-source-tabs"><button type="button" disabled={!!busy} className={tab === 'link' ? 'selected' : ''} onClick={() => setTab('link')}><Link2 size={14}/>Colar um link</button><button type="button" disabled={!!busy} className={tab === 'upload' ? 'selected' : ''} onClick={() => setTab('upload')}><Upload size={14}/>Enviar arquivo</button></div>{tab === 'link' ? <label className="dg-field">Link do vídeo<input type="url" value={url} disabled={!!busy} onChange={event => setUrl(event.target.value)} placeholder="https://youtube.com/watch?v=…"/></label> : <div className="dg-dropzone"><Upload size={23}/><button type="button" disabled={!!busy} onClick={() => input.current?.click()}>{file?.name || 'Escolher vídeo do computador'}</button><small>MP4, MOV, MKV ou WebM · até 8 GB</small><input type="file" className="sr-only" ref={input} accept=".mp4,.mov,.m4v,.mkv,.webm" aria-label="Escolher vídeo" onChange={event => { setFile(event.target.files?.[0]); setUploaded(undefined); }}/></div>}{recent.length > 0 && <label className="dg-field studio-recent-source">Ou reutilize um vídeo importado<select value="" disabled={!!busy} onChange={event => { const source = recent.find(source => source.id === event.target.value); if (source) useSource(source); }}><option value="">Selecionar vídeo do estúdio…</option>{recent.map(source => <option value={source.id} key={source.id}>{source.title}</option>)}</select></label>}</>}
      <div className="studio-control-label"><b>02</b><h3>Defina a curadoria</h3></div><div className="dg-form-row"><label className="dg-field">Quantidade desejada<input type="number" min="1" max="50" value={options.clip_count === 'auto' ? '' : options.clip_count} placeholder="Automática" disabled={!!busy} onChange={event => change('clip_count', event.target.value ? Number(event.target.value) : 'auto')}/><small>Deixe vazio para automática · até 50</small></label><label className="dg-field">Priorizar<select value={options.editorial_focus} disabled={!!busy} onChange={event => change('editorial_focus', event.target.value)}><option value="balanced">Melhores momentos</option><option value="funny">Momentos engraçados</option><option value="insight">Falas importantes</option><option value="story">Histórias completas</option></select></label></div><label className="dg-field">Duração dos clipes<select value={options.clip_length} disabled={!!busy} onChange={event => change('clip_length', event.target.value)}><option value="auto">Automática · 8–90 segundos</option><option value="short">Curtos · 15–30 segundos</option><option value="medium">Médios · 30–60 segundos</option><option value="long">Longos · 60–90 segundos</option></select></label>
      <div className="studio-control-label"><b>03</b><h3>Monte a composição</h3></div><div className="studio-layout-picks">{[{ id: 'fill', name: 'Tela cheia', icon: Film }, { id: 'react_top', name: 'Câmera em cima', icon: Camera }, { id: 'react_bottom', name: 'Câmera embaixo', icon: Camera }].map(item => <button key={item.id} type="button" disabled={!!busy} aria-pressed={options.layout === item.id} className={options.layout === item.id ? 'selected' : ''} onClick={() => { change('layout', item.id); if (!camera && prepared?.camera_rect) setCamera(prepared.camera_rect); }}><span className={`studio-layout-icon ${item.id}`}><item.icon size={17}/></span>{item.name}</button>)}</div><div className="dg-form-row"><label className="dg-field">Estilo da legenda<select value={options.caption_template} disabled={!!busy} onChange={event => setOptions(previous => ({ ...previous, caption_template: event.target.value, caption_color: null }))}>{presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label><label className="dg-field">Exportar em<select value={options.resolution} disabled={!!busy} onChange={event => change('resolution', event.target.value)}><option value="1080">1080p · Alta qualidade</option><option value="720">720p · Mais rápido</option></select></label></div>{react && <label className="dg-field studio-camera-share">Espaço da câmera · {Math.round(options.camera_share*100)}%<input type="range" min="20" max="50" step="1" value={options.camera_share*100} disabled={!!busy} onChange={event => change('camera_share', Number(event.target.value)/100)}/></label>}<label className="dg-checkbox"><input type="checkbox" checked={options.add_subtitles} disabled={!!busy} onChange={event => change('add_subtitles', event.target.checked)}/><span><strong>Legendas automáticas</strong><small>Sincronizadas com cada palavra.</small></span></label><details className="studio-finish-options"><summary>Acabamento e preferências</summary><div className="dg-form-row"><label className="dg-field">Posição da legenda<select value={options.caption_position} onChange={event => change('caption_position', event.target.value)}><option value="auto">Automática</option><option value="upper">Superior</option><option value="middle">Centro</option><option value="lower">Inferior segura</option>{react && <option value="seam">Divisão dos painéis</option>}</select></label><label className="dg-field">Cor do destaque<input type="color" value={options.caption_color || presetFor(options.caption_template).accent} onChange={event => change('caption_color', event.target.value)}/></label></div><label className="dg-field">Tamanho da legenda · {Math.round(options.caption_scale*100)}%<input type="range" min="70" max="130" value={options.caption_scale*100} onChange={event => change('caption_scale', Number(event.target.value)/100)}/></label><label className="dg-field">Direção para a IA <span className="studio-optional">opcional</span><textarea maxLength={1000} rows={3} value={options.editorial_brief} onChange={event => change('editorial_brief', event.target.value)} placeholder="Ex.: priorize as reações mais engraçadas e os comentários sobre a partida."/></label><label className="dg-field">Outros enquadramentos<select value={options.layout} onChange={event => change('layout', event.target.value)}><option value="fill">Vertical · Preencher a tela</option><option value="react_top">React · Câmera em cima</option><option value="react_bottom">React · Câmera embaixo</option><option value="fit">Vídeo completo · Fundo desfocado</option><option value="original">Formato original</option></select></label></details></div><div className="studio-create-preview"><div className="studio-preview-heading"><Image size={16}/><strong>Seu corte, antes de exportar</strong><span>AO VIVO</span></div>{prepared ? <FrameEditor source={prepared} camera={camera} content={content} setCamera={setCamera} setContent={setContent} options={options}/> : <div className="studio-preview-waiting"><OutputPreview camera={camera} content={content} options={options}/><h3>{react ? 'Separe a câmera do conteúdo.' : 'Tudo no seu enquadramento.'}</h3><p>{react ? 'Prepare a prévia. O DGCLIPS sugere a câmera e você ajusta as duas áreas antes de gerar.' : 'O vídeo preenche a tela. Prepare a prévia se quiser ajustar a área do conteúdo.'}</p><button type="button" className="dg-button dg-secondary" disabled={!!busy} onClick={() => void prepare()}>{busy === 'preview' ? <Loader2 size={16} className="dg-spin"/> : <ScanFace size={16}/>}Preparar prévia de enquadramento</button></div>}<p className="studio-preview-note">As legendas da prévia usam texto ilustrativo. Na exportação, acompanham a fala do seu vídeo.</p></div></div>{error && <p className="dg-form-error" role="alert">{error}</p>}{busy && <div className="studio-prepare-progress" role="status"><Loader2 size={17} className="dg-spin"/><span>{stage || 'Preparando…'}</span></div>}<div className="studio-create-footer"><p><ShieldCheck size={15}/><span>IA local. No primeiro uso, download de 2,5 GB.<small>Se houver menos bons momentos, explicamos o resultado.</small></span></p><button type="submit" className="dg-button dg-primary" disabled={!!busy}>{busy ? <Loader2 size={17} className="dg-spin"/> : <Sparkles size={17}/>} {react && !prepared ? 'Preparar o react' : options.clip_count === 'auto' ? 'Encontrar meus melhores clipes' : `Gerar até ${options.clip_count} clipes`}<ChevronRight size={16}/></button></div></form></DialogContent></Dialog>;
}
