export type Bridge = { open_projects: () => Promise<boolean>; save_clip: (project: string, clip: string) => Promise<boolean> };
declare global { interface Window { pywebview?: { api: Bridge } } }
export async function openProjects() {
  if (window.pywebview?.api) return window.pywebview.api.open_projects();
  throw new Error("Abra o aplicativo DGCLIPS para acessar a pasta no Windows.");
}
export async function saveClip(project: string, clip: string) {
  if (window.pywebview?.api) return window.pywebview.api.save_clip(project, clip);
  const a = document.createElement("a");
  a.href = `/api/tasks/${project}/clips/${clip}/file?download`;
  a.download = `DGCLIPS-${clip}.mp4`;
  a.click();
  return true;
}
