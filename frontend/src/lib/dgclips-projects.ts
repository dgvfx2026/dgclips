import type { GenerationSummary } from "./generations";
export type ProjectStatus = "completed" | "processing" | "failed";
export interface StudioProject {
  id: string; title: string; category: string; image: string; duration?: string;
  clips: number; status: ProjectStatus; date: string; sample?: boolean; score?: number | null;
}
export const sampleProjects: StudioProject[] = [
  { id: "demo-podcast", title: "Conversas que merecem ir além", category: "Podcast", image: "/studio/podcast.jpg", duration: "48:32", clips: 12, status: "completed", date: "2026-10-27T12:00:00Z", sample: true, score: 94 },
  { id: "demo-creative", title: "Por dentro do processo criativo", category: "Criatividade", image: "/studio/creative.jpg", duration: "32:18", clips: 8, status: "completed", date: "2026-10-26T12:00:00Z", sample: true, score: 89 },
  { id: "demo-business", title: "Ideias que viram grandes negócios", category: "Negócios", image: "/studio/business.jpg", duration: "56:07", clips: 6, status: "completed", date: "2026-10-25T12:00:00Z", sample: true, score: 91 },
];
export function normalizeProject(task: GenerationSummary): StudioProject {
  const status: ProjectStatus = ["completed", "done"].includes(task.status) ? "completed"
    : ["failed", "error", "cancelled"].includes(task.status) ? "failed" : "processing";
  return { id: task.id, title: task.source_title || "Projeto sem título", category: task.source_type === "upload" ? "Upload" : "Vídeo por link", image: "", clips: task.clips_count || 0, status, date: task.created_at, score: task.top_virality_score };
}
export function filterProjects(projects: StudioProject[], query: string, status: string, favorites: string[]) {
  const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return projects.filter((project) => {
    const title = `${project.title} ${project.category}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return title.includes(normalized) && (status === "all" || (status === "favorites" ? favorites.includes(project.id) : project.status === status));
  });
}
