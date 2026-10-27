"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Bell, Captions, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clapperboard, Clock3, Film, FolderOpen, Grid2X2, LayoutDashboard, List, Loader2, Menu, MoreHorizontal, Play, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Star, Upload, WandSparkles, X, Youtube, Zap } from "lucide-react";
import { toast } from "sonner";
import { useSession, signOut } from "@/lib/auth-client";
import { fetchGenerations, timeAgo } from "@/lib/generations";
import { filterProjects, normalizeProject, sampleProjects, type StudioProject } from "@/lib/dgclips-projects";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CreateDialog } from "./create-dialog";
import { Guide, Settings, TemplateGallery } from "./workspace-panels";
import "./workspace.css";

export type View = "dashboard" | "projects" | "clips" | "templates" | "guide" | "setup";
export type StudioUser = { id: string; name?: string | null; email?: string | null };
const labels: Record<View, string> = { dashboard: "Visão geral", projects: "Meus projetos", clips: "Meus clipes", templates: "Estilos de legenda", guide: "Como funciona", setup: "Configurações" };
const nav = [
  { id: "dashboard", href: "/", icon: LayoutDashboard, label: "Visão geral" },
  { id: "projects", href: "/projects", icon: FolderOpen, label: "Meus projetos" },
  { id: "clips", href: "/clips", icon: Clapperboard, label: "Meus clipes" },
  { id: "templates", href: "/templates", icon: Captions, label: "Estilos de legenda" },
] as const;

export function Workspace({ view, configured }: { view: View; configured: boolean }) {
  return configured ? <ConnectedWorkspace view={view} /> : <Studio view={view} demo />;
}
function ConnectedWorkspace({ view }: { view: View }) {
  const { data: session, isPending } = useSession();
  return <Studio view={view} demo={false} user={session?.user} sessionPending={isPending} />;
}

function Studio({ view, demo, user, sessionPending }: { view: View; demo: boolean; user?: StudioUser; sessionPending?: boolean }) {
  const router = useRouter();
  const [projects, setProjects] = useState<StudioProject[]>(demo ? sampleProjects : []);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [layout, setLayout] = useState("grid");
  const [sort, setSort] = useState("recent");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [preview, setPreview] = useState<StudioProject | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [template, setTemplate] = useState("default");
  const favoriteKey = `dgclips:favorites:${user?.id || "demo"}`;

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(favoriteKey) || "[]");
      setFavorites(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : []);
      const savedTemplate = localStorage.getItem("dgclips:template");
      if (["default", "hormozi", "tiktok"].includes(savedTemplate || "")) setTemplate(savedTemplate!);
    } catch { /* Browser storage is optional. */ }
  }, [favoriteKey]);
  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true); setLoadError(false);
    try { setProjects((await fetchGenerations()).map(normalizeProject)); }
    catch { setLoadError(true); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { void refresh(); }, [refresh]);
  const processing = projects.filter((p) => p.status === "processing").length;
  useEffect(() => {
    if (!processing || !user) return;
    const interval = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(interval);
  }, [processing, refresh, user]);
  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
    setFavorites(next);
    try { localStorage.setItem(favoriteKey, JSON.stringify(next)); } catch { /* Session-only fallback. */ }
  };
  const chooseTemplate = (id: string) => {
    setTemplate(id);
    try { localStorage.setItem("dgclips:template", id); } catch { /* Session-only fallback. */ }
    toast.success("Estilo definido para os próximos clipes.");
  };
  const openProject = (project: StudioProject) => project.sample ? setPreview(project) : router.push(`/tasks/${encodeURIComponent(project.id)}`);
  const visible = filterProjects(projects, query, filter, favorites).sort((a, b) => sort === "name" ? a.title.localeCompare(b.title, "pt-BR") : new Date(b.date).getTime() - new Date(a.date).getTime());
  const totalClips = projects.reduce((sum, p) => sum + p.clips, 0);
  const create = useCallback(() => { setMobileOpen(false); setNewOpen(true); }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "n" && !event.ctrlKey && !event.metaKey && !event.altKey && !(event.target as HTMLElement)?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) { event.preventDefault(); create(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [create]);

  return <div className="dg-studio">
    <a className="dg-skip" href="#studio-content">Ir para o conteúdo</a>
    {mobileOpen && <button className="dg-backdrop" aria-label="Fechar navegação" onClick={() => setMobileOpen(false)} />}
    <aside className={`dg-sidebar ${mobileOpen ? "is-open" : ""}`}>
      <Link href="/" className="dg-logo" aria-label="DGCLIPS, início"><Image src="/dgclips.svg" width={35} height={35} alt="" /><span>DG<span>CLIPS</span><i /></span></Link>
      <button className="dg-workspace-switch" onClick={() => router.push("/workspace/settings")}><span className="dg-workspace-avatar">DG</span><span>Workspace pessoal<small>Seu espaço de criação</small></span><ChevronDown size={14} /></button>
      <button className="dg-button dg-primary dg-new-project" onClick={create}><Plus size={18} /> Novo projeto <kbd>N</kbd></button>
      <p className="dg-nav-label">ESTÚDIO</p>
      <nav aria-label="Navegação principal">{nav.map((item) => <Link key={item.id} href={item.href} aria-current={view === item.id ? "page" : undefined} className={`dg-nav-item ${view === item.id ? "active" : ""}`}><item.icon size={18} strokeWidth={1.7} /><span>{item.label}</span>{item.id === "projects" && <b>{projects.length}</b>}{view === item.id && <span className="dg-nav-dot" />}</Link>)}</nav>
      <p className="dg-nav-label dg-tools-label">SEU WORKSPACE</p>
      <Link className={`dg-nav-item ${view === "setup" ? "active" : ""}`} href="/workspace/settings"><Settings2 size={18} strokeWidth={1.7} />Configurações</Link>
      <Link className={`dg-nav-item ${view === "guide" ? "active" : ""}`} href="/guide"><CircleHelp size={18} strokeWidth={1.7} />Como funciona<ArrowUpRight size={14} className="dg-nav-end" /></Link>
      <div className="dg-sidebar-bottom"><div className="dg-creative-note"><span className="dg-note-icon"><Zap size={19} /></span><h3>Mais conteúdo.<br />A mesma essência.</h3><p>Transforme uma boa conversa em muitas novas conexões.</p><Link href="/guide">Explore o DGCLIPS <ArrowUpRight size={14} /></Link></div><button className="dg-profile" onClick={() => router.push(demo ? "/workspace/settings" : user ? "/settings" : "/sign-in")}><span className="dg-profile-avatar">{user?.name?.slice(0, 2).toUpperCase() || "DG"}</span><span>{user?.name || "Seu estúdio"}<small>{demo ? "Modo demonstração" : user ? "Workspace pessoal" : "Entrar na sua conta"}</small></span><Settings2 size={16} /></button></div>
    </aside>
    <div className="dg-main"><header className="dg-topbar"><button className="dg-icon-button dg-mobile-menu" aria-label="Abrir navegação" onClick={() => setMobileOpen(true)}><Menu size={22} /></button><div className="dg-breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong>{labels[view]}</strong></div><div className="dg-top-actions"><span className="dg-status-dot" /><span className="dg-top-status">{demo ? "Demonstração" : user ? "Workspace conectado" : "Workspace pessoal"}</span><span className="dg-top-divider" /><Popover><PopoverTrigger asChild><button className="dg-icon-button dg-notification" aria-label="Notificações"><Bell size={19} />{processing > 0 && <i />}</button></PopoverTrigger><PopoverContent className="dg-popover" align="end"><h3>Seu estúdio está em dia</h3><p>{demo ? "Você está explorando projetos de exemplo. Conecte seu servidor para começar a criar." : processing ? `${processing} projeto(s) em processamento. O progresso é atualizado automaticamente.` : "Nenhum processamento em andamento."}</p><Link href="/projects">Ver meus projetos <ArrowRight size={14} /></Link></PopoverContent></Popover><span className="dg-header-avatar">{user?.name?.slice(0, 2).toUpperCase() || "DG"}</span></div></header>
      <main id="studio-content" className="dg-content">
        <div className="dg-page-heading"><div><p className="dg-eyebrow">{view === "dashboard" ? "CRIE. RECORTE. CONECTE." : "SEU CONTEÚDO, DO SEU JEITO."}</p><h1>{view === "dashboard" ? <>Boas ideias merecem <span>mais alcance.</span></> : labels[view]}</h1><p className="dg-subtitle">{view === "dashboard" ? "Seu conteúdo tem potencial. Vamos encontrar os melhores momentos?" : view === "projects" ? "Todas as suas ideias, organizadas em um só lugar." : view === "clips" ? "Seus próximos Reels, Shorts e TikToks começam aqui." : view === "templates" ? "Dê voz e personalidade a cada palavra." : view === "guide" ? "Do vídeo completo ao próximo grande momento." : "Tudo pronto para o seu jeito de criar."}</p></div>{["projects", "clips", "templates"].includes(view) && <button className="dg-button dg-primary" onClick={create}><Plus size={17} />Novo projeto</button>}<span className="dg-heading-decoration"><Sparkles size={24} strokeWidth={1.1} /></span></div>
        {demo && view !== "dashboard" && <div className="dg-demo-notice"><Sparkles size={15} /><span>Modo demonstração · Os projetos e clipes exibidos são exemplos.</span><Link href="/workspace/settings">Conectar meu estúdio <ArrowRight size={13} /></Link></div>}
        {!demo && !user && !sessionPending && <div className="dg-demo-notice"><ShieldCheck size={17} /><span>Entre na sua conta para criar e acessar seus projetos.</span><Link href="/sign-in">Entrar <ArrowRight size={14} /></Link></div>}
        {view === "dashboard" && <><Hero url={url} setUrl={setUrl} create={create} /><section className="dg-stat-grid" aria-label={demo ? "Estatísticas dos projetos de exemplo" : "Resumo do estúdio"}>{[{ label: "Projetos no estúdio", value: projects.length, icon: FolderOpen, note: "Tudo em um só lugar", color: "lime" }, { label: "Clipes gerados", value: totalClips, icon: Clapperboard, note: "Novas possibilidades", color: "blue" }, { label: "Em processamento", value: processing, icon: Clock3, note: processing ? "A mágica está acontecendo" : "Pronto para o próximo", color: "orange" }, { label: "Seus favoritos", value: favorites.length, icon: Star, note: "Os que você mais gostou", color: "purple" }].map((stat) => <div className="dg-stat" key={stat.label}><div className="dg-stat-top"><span>{stat.label}</span><stat.icon size={16} className={`dg-stat-${stat.color}`} /></div><div className="dg-stat-value">{stat.value.toString().padStart(2, "0")}<span>{stat.note}</span></div></div>)}</section></>}
        {["dashboard", "projects", "clips"].includes(view) && <section className="dg-project-section">
          <div className="dg-section-heading"><div><h2>{view === "dashboard" ? "Seus projetos recentes" : view === "clips" ? "Clipes por projeto" : "Sua biblioteca criativa"}{demo && <span className="dg-example-badge">EXEMPLOS</span>}</h2>{view === "dashboard" && <p>Retome de onde parou. Ou comece algo novo.</p>}</div>{view === "dashboard" ? <Link href="/projects" className="dg-text-link">Ver todos os projetos <ArrowUpRight size={16} /></Link> : <label className="dg-sort-label"><SlidersHorizontal size={14} /><select aria-label="Ordenar projetos" value={sort} onChange={(e) => setSort(e.target.value)}><option value="recent">Mais recentes</option><option value="name">Nome do projeto</option></select></label>}</div>
          <div className="dg-library-toolbar"><div className="dg-tabs" role="group" aria-label="Filtrar projetos">{[{ id: "all", name: "Todos", count: projects.length }, { id: "completed", name: "Concluídos" }, { id: "processing", name: "Em processamento" }, { id: "favorites", name: "Favoritos" }].map((item) => <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={filter === item.id ? "selected" : ""}>{item.name}{item.count !== undefined && <span>{item.count}</span>}</button>)}</div><div className="dg-library-tools"><label className="dg-search"><Search size={15} /><input aria-label="Buscar projetos" placeholder="Buscar projeto…" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button aria-label="Limpar busca" onClick={() => setQuery("")}><X size={12} /></button>}</label><div className="dg-layout-toggle"><button aria-label="Visualização em grade" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")} className={layout === "grid" ? "selected" : ""}><Grid2X2 size={16} /></button><button aria-label="Visualização em lista" aria-pressed={layout === "list"} onClick={() => setLayout("list")} className={layout === "list" ? "selected" : ""}><List size={17} /></button></div></div></div>
          {loadError ? <div className="dg-empty"><CircleHelp size={28} /><h3>Não foi possível carregar seus projetos</h3><p>Confira a conexão com o servidor e tente novamente.</p><button className="dg-button dg-secondary" onClick={() => void refresh()}>Tentar novamente</button></div> : loading && !projects.length ? <div className="dg-empty" role="status"><Loader2 className="dg-spin" /><p>Organizando seus projetos…</p></div> : visible.length ? <div className={`dg-project-grid ${layout === "list" ? "dg-project-list" : ""}`}>{(view === "dashboard" ? visible.slice(0, 3) : visible).map((project) => <article className="dg-project-card" key={project.id}><button className="dg-project-cover" onClick={() => openProject(project)} aria-label={`Abrir projeto ${project.title}`}>{project.image ? <Image src={project.image} fill sizes="(max-width: 700px) 90vw, 30vw" alt="" /> : <div className="dg-cover-placeholder"><Clapperboard size={40} /><span>DGCLIPS STUDIO</span></div>}<div className="dg-cover-shade" /><span className={`dg-project-state ${project.status}`}><i />{project.status === "completed" ? "Concluído" : project.status === "failed" ? "Falhou" : "Processando"}</span><span className="dg-cover-play"><Play size={18} fill="currentColor" /></span>{project.duration && <span className="dg-cover-duration">{project.duration}</span>}<span className="dg-cover-category">{project.category}</span></button><div className="dg-project-info"><div className="dg-project-title"><button onClick={() => openProject(project)}>{project.title}</button><DropdownMenu><DropdownMenuTrigger asChild><button className="dg-icon-button" aria-label={`Opções de ${project.title}`}><MoreHorizontal size={18} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openProject(project)}><FolderOpen size={14} />Abrir projeto</DropdownMenuItem><DropdownMenuItem onClick={() => toggleFavorite(project.id)}><Star size={14} />{favorites.includes(project.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div><div className="dg-project-meta"><span><Clapperboard size={12} />{project.clips} clipes</span><i /><span>{project.sample ? "Projeto de exemplo" : timeAgo(project.date, "pt")}</span><button className={favorites.includes(project.id) ? "is-favorite" : ""} onClick={() => toggleFavorite(project.id)} aria-label={favorites.includes(project.id) ? `Remover ${project.title} dos favoritos` : `Favoritar ${project.title}`} aria-pressed={favorites.includes(project.id)}><Star size={14} fill={favorites.includes(project.id) ? "currentColor" : "none"} /></button></div></div></article>)}</div> : <div className="dg-empty"><FolderOpen size={32} /><h3>{query || filter !== "all" ? "Nenhum projeto por aqui" : "Sua próxima ideia começa aqui"}</h3><p>{query || filter !== "all" ? "Experimente outra busca ou filtro." : "Adicione seu primeiro vídeo e descubra novos momentos."}</p><button className="dg-button dg-secondary" onClick={() => query || filter !== "all" ? (setQuery(""), setFilter("all")) : create()}>{query || filter !== "all" ? "Limpar filtros" : "Criar meu primeiro projeto"}<ArrowRight size={14} /></button></div>}
        </section>}
        {view === "dashboard" && <Link className="dg-bottom-banner" href="/templates"><span className="dg-bottom-icon"><Captions size={21} /></span><div><h3>Seu conteúdo. Sua personalidade.</h3><p>Encontre o estilo de legenda que combina com a sua marca.</p></div><span>Explorar estilos <ArrowUpRight size={16} /></span></Link>}
        {view === "templates" && <TemplateGallery template={template} chooseTemplate={chooseTemplate} />}
        {view === "guide" && <Guide create={create} />}
        {view === "setup" && <Settings demo={demo} user={user} onSignOut={async () => { await signOut(); window.location.assign("/"); }} />}
        <footer className="dg-footer"><span>DGCLIPS <i>STUDIO</i><b>·</b> Menos edição. Mais criação.{<a href={process.env.NEXT_PUBLIC_SOURCE_URL || "https://github.com/dgvfx2026/dgclips"} target="_blank" rel="noreferrer"> · Código-fonte ↗</a>}</span><span>{demo ? "Você está explorando uma demonstração" : "Seu conteúdo, sob seu controle."}<span className="dg-footer-dot" /></span></footer>
      </main>
    </div>
    <CreateDialog open={newOpen} onOpenChange={setNewOpen} demo={demo} user={user} initialUrl={url} template={template} onDemo={() => { setNewOpen(false); setPreview(sampleProjects[0]); }} />
    <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}><DialogContent className="dg-preview-dialog"><DialogTitle>{preview?.title}</DialogTitle><DialogDescription>Prévia demonstrativa do motor SupoClip. O conteúdo original está em inglês; os títulos da biblioteca são ilustrativos.</DialogDescription>{preview && <video controls playsInline preload="metadata" poster="/clips/podcast-1.jpg" key={preview.id}><source src={preview.id === "demo-creative" ? "/clips/podcast-2.mp4" : "/clips/podcast-1.mp4"} type="video/mp4" /><track kind="captions" /></video>}<Link href="/workspace/settings" className="dg-button dg-primary">Conectar meus próprios vídeos <ArrowRight size={16} /></Link></DialogContent></Dialog>
  </div>;
}

function Hero({ url, setUrl, create }: { url: string; setUrl: (value: string) => void; create: () => void }) {
  return <section className="dg-hero" aria-label="Criar clipes com inteligência artificial"><div className="dg-hero-copy"><div className="dg-hero-kicker"><span><WandSparkles size={13} /> UM VÍDEO. MUITAS POSSIBILIDADES.</span><i>BETA</i></div><h2>Encontre o extraordinário<br />no seu <span>próximo clipe.</span><svg viewBox="0 0 230 14" aria-hidden="true"><path d="M3 10Q100 -1 225 8" /></svg></h2><p>Transforme vídeos longos em clipes que prendem a atenção.<br className="dg-desktop-break" /> Com inteligência artificial e a sua identidade.</p><form className="dg-url-bar" onSubmit={(e) => { e.preventDefault(); create(); }}><LinkIcon /><input aria-label="Link do vídeo" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Cole o link do seu vídeo aqui…" type="url" /><button type="submit" className="dg-button dg-primary">Criar clipes <ArrowRight size={16} /></button></form><div className="dg-source-options"><span><Youtube size={15} /> YouTube</span><span><Film size={14} /> Twitch e Kick</span><i /><button onClick={create}><Upload size={13} /> ou envie um arquivo</button></div></div><div className="dg-hero-art" aria-hidden="true"><div className="dg-orbit dg-orbit-one" /><div className="dg-orbit dg-orbit-two" /><div className="dg-mini-frame dg-mini-left"><Image src="/studio/creative.jpg" fill sizes="180px" alt="" /><div className="dg-mini-caption">toda ideia<br /><b>merece espaço.</b></div><span className="dg-mini-duration">00:32</span></div><div className="dg-mini-frame dg-mini-right"><Image src="/studio/business.jpg" fill sizes="180px" alt="" /><div className="dg-mini-caption">crie o seu<br /><b>próximo passo.</b></div></div><div className="dg-mini-frame dg-mini-center"><Image src="/studio/podcast.jpg" fill sizes="200px" alt="" /><span className="dg-mini-record"><i /> SEU MELHOR MOMENTO</span><div className="dg-mini-caption">o segredo é<br /><b>começar.</b></div><span className="dg-mini-duration"><Play size={9} fill="currentColor" /> 00:48</span><span className="dg-mini-dg">DG</span></div><div className="dg-ai-tag"><Sparkles size={15} /><div>O melhor do seu conteúdo<small>Um novo olhar, com IA.</small></div><CheckCheck size={16} /></div><span className="dg-art-star">✳</span></div></section>;
}
function LinkIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2-1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)" /></svg>; }
