export { validateVideoSourceUrl, formatUploadLimit } from "../../frontend/src/lib/video-upload";
export function maxVideoUploadBytes() { return 8_000_000_000; }
export async function uploadVideoFile(file: File) {
  const response = await fetch(`/api/desktop/upload?name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível copiar o vídeo.");
  return data.video_path as string;
}
