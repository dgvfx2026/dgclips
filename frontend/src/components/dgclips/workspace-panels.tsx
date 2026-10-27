import Image from "next/image";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, Play, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Upload, WandSparkles } from "lucide-react";
import type { StudioUser } from "./workspace";

const templates = [
  { id: "default", name: "Essencial", subtitle: "Limpo, direto e sempre legível.", className: "essential", caption: <>Sua ideia.<br /><em>Em destaque.</em></> },
  { id: "hormozi", name: "Impacto", subtitle: "Palavras fortes. Atenção total.", className: "impact", caption: <>FAÇA CADA<br /><em>SEGUNDO</em> CONTAR.</> },
  { id: "tiktok", name: "Dinâmico", subtitle: "O ritmo que seu conteúdo pede.", className: "dynamic", caption: <>uma boa ideia<br /><em>muda tudo ✦</em></> },
];

export function WorkflowPreview() {
  const steps = [
    { icon: Upload, title: "Traga seu vídeo", text: "Um link ou um arquivo. A próxima ideia começa aqui." },
    { icon: WandSparkles, title: "Descubra os momentos", text: "A IA encontra os trechos que merecem ir além." },
    { icon: SlidersHorizontal, title: "Dê o seu toque", text: "Cortes, enquadramento e legendas com a sua identidade." },
    { icon: ArrowDownToLine, title: "Pronto para o mundo", text: "Baixe seus clipes e leve sua história mais longe." },
  ];
  return <section className="dg-workflow-section" aria-label="Seu fluxo de criação">
    <div className="dg-section-heading"><div><h2>Do primeiro play ao próximo post.</h2><p>Um fluxo leve, do começo ao seu melhor momento.</p></div><Link href="/guide" className="dg-text-link">Ver como funciona <ArrowUpRight size={15} /></Link></div>
    <div className="dg-flow-grid">{steps.map((step, index) => <article className="dg-flow-card" key={step.title}><span className="dg-flow-index">0{index + 1}</span><span className="dg-flow-icon"><step.icon size={21} /></span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div>
  </section>;
}
export function TemplateGallery({ template, chooseTemplate }: { template: string; chooseTemplate: (value: string) => void }) {
  return <><div className="dg-template-grid">{templates.map((item, i) => <article key={item.id} className={`dg-template-card ${template === item.id ? "chosen" : ""}`}><div className={`dg-template-preview ${item.className}`}><Image src={["/studio/podcast.jpg", "/studio/creative.jpg", "/studio/business.jpg"][i]} fill sizes="350px" alt="" /><span className="dg-template-number">0{i + 1}</span><p>{item.caption}</p></div><div className="dg-template-info"><div><h3>{item.name}</h3><p>{item.subtitle}</p></div><button className={`dg-button ${template === item.id ? "dg-primary" : "dg-secondary"}`} onClick={() => chooseTemplate(item.id)}>{template === item.id ? <><Check size={15} />Selecionado</> : "Usar estilo"}</button></div></article>)}</div><div className="dg-tip"><Sparkles size={18} /><p>O estilo selecionado será aplicado aos próximos projetos. Você pode ajustar fonte, cor e tamanho no editor.</p></div></>;
}
export function Guide({ create }: { create: () => void }) {
  return <><div className="dg-guide-hero"><span className="dg-guide-mark"><Play size={34} fill="currentColor" /></span><h2>Uma boa história.<br /><span>Muitos novos começos.</span></h2><p>Você cuida das ideias. O DGCLIPS encontra os momentos que merecem ser compartilhados.</p><button className="dg-button dg-primary" onClick={create}>Vamos criar <ArrowRight size={16} /></button></div><div className="dg-guide-grid">{[{ icon: Upload, title: "Traga sua ideia", text: "Cole um link do YouTube, Twitch ou Kick, ou envie um vídeo MP4, MOV ou WebM." }, { icon: WandSparkles, title: "Deixe a IA encontrar", text: "A IA transcreve, seleciona trechos e prepara o enquadramento e as legendas." }, { icon: SlidersHorizontal, title: "Dê o seu toque", text: "Revise os clipes, ajuste os cortes e personalize o estilo no editor." }, { icon: ArrowDownToLine, title: "Pronto para conectar", text: "Baixe seus clipes e publique nas suas redes. Sem marca d’água." }].map((step, i) => <article key={step.title}><span className="dg-step-number">0{i + 1}</span><step.icon size={25} /><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></>;
}
export function Settings({ demo, user, onSignOut }: { demo: boolean; user?: StudioUser; onSignOut: () => Promise<void> }) {
  return <div className="dg-settings-grid"><section className="dg-settings-card"><span className="dg-settings-icon"><Settings2 size={23} /></span><h2>Seu workspace</h2><p>Uma estrutura preparada para o seu estúdio pessoal.</p><dl><div><dt>Identidade</dt><dd>DGCLIPS Studio</dd></div><div><dt>Idioma</dt><dd>Português do Brasil</dd></div><div><dt>Interface</dt><dd>Midnight · Liquid Glass</dd></div><div><dt>Conexão</dt><dd className={demo ? "" : "dg-lime"}>{demo ? "Demonstração" : "Servidor configurado"}</dd></div></dl>{!demo && <Link href={user ? "/settings" : "/sign-in"} className="dg-button dg-secondary">{user ? "Gerenciar minha conta" : "Entrar no estúdio"}<ArrowUpRight size={15} /></Link>}{user && <button className="dg-signout" onClick={() => void onSignOut()}>Sair da conta</button>}</section><section className="dg-settings-card"><span className="dg-settings-icon"><ShieldCheck size={23} /></span><h2>{demo ? "Conecte seu estúdio" : "Seu estúdio está conectado"}</h2><p>{demo ? "Para processar seus próprios vídeos, complete a configuração descrita no README do projeto." : "Os projetos são privados e vinculados à sua conta. O processamento acontece no seu servidor."}</p><ol className="dg-setup-steps"><li><b>1</b><div><strong>Publique a interface</strong><p>Importe o repositório na Vercel e selecione a pasta frontend.</p></div></li><li><b>2</b><div><strong>Conecte o processamento</strong><p>O backend e o worker estão preparados no vercel.json da raiz.</p></div></li><li><b>3</b><div><strong>Configure as variáveis</strong><p>Configure PostgreSQL, Redis, S3 e suas chaves de IA nas variáveis da Vercel.</p></div></li></ol><Link href="/guide" className="dg-text-link">Conhecer o fluxo de criação <ArrowRight size={15} /></Link></section></div>;
}
