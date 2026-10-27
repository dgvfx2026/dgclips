"""Single-user desktop processor. All media and project state stay on this PC."""
from __future__ import annotations

import json
import logging
import os
import queue
import re
import shutil
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from clipping import make_ass, suggest_clips

LOG = logging.getLogger("dgclips")
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
MAX_BYTES = 8_000_000_000
MAX_SECONDS = 4 * 3600


class Cancelled(Exception):
    pass


def validate_url(value: str) -> str:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower().removeprefix("www.")
    if parsed.scheme not in {"http", "https"} or parsed.username or parsed.password or parsed.port not in {None, 80, 443}:
        raise ValueError("Cole um link público de vídeo do YouTube, Twitch ou Kick.")
    if host not in {"youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "twitch.tv", "m.twitch.tv", "go.twitch.tv", "clips.twitch.tv", "kick.com"}:
        raise ValueError("Use YouTube, Twitch ou Kick. Outros sites não são suportados.")
    return value


class Engine:
    def __init__(self, data: Path, resources: Path):
        self.data = data.resolve()
        self.resources = resources.resolve()
        self.jobs_dir = self.data / "Projetos"
        self.uploads = self.data / "Entradas"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        self.uploads.mkdir(exist_ok=True)
        self.lock = threading.RLock()
        self.jobs: dict[str, dict] = {}
        self.events: dict[str, threading.Event] = {}
        self.queue: queue.Queue[str | None] = queue.Queue()
        self.stopping = threading.Event()
        self.model = None
        self.process = None
        for state in self.jobs_dir.glob("*/project.json"):
            try:
                job = json.loads(state.read_text(encoding="utf-8"))
                if job["status"] in {"processing", "queued"}:
                    job.update(status="failed", stage="Processamento interrompido", error="O programa foi fechado antes de terminar. Clique em tentar novamente.")
                self.jobs[job["id"]] = job
            except (OSError, ValueError, KeyError):
                LOG.exception("Could not load project %s", state.name)
        self.worker = threading.Thread(target=self._worker, name="DGCLIPS-processor", daemon=True)
        self.worker.start()

    @property
    def ffmpeg(self) -> str:
        bundled = self.resources / "tools" / "ffmpeg.exe"
        if bundled.is_file():
            return str(bundled)
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()

    def _save(self, job: dict):
        with self.lock:
            path = self.jobs_dir / job["id"] / "project.json"
            temp = path.with_suffix(".tmp")
            temp.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
            temp.replace(path)

    def update(self, job: dict, **values):
        with self.lock:
            job.update(values, updated_at=datetime.now(timezone.utc).isoformat())
            self._save(job)

    def list(self) -> list[dict]:
        with self.lock:
            return [json.loads(json.dumps(j)) for j in sorted(self.jobs.values(), key=lambda j: j["created_at"], reverse=True)]

    def get(self, job_id: str) -> dict:
        with self.lock:
            if job_id not in self.jobs:
                raise ValueError("Projeto não encontrado.")
            return json.loads(json.dumps(self.jobs[job_id]))

    def create(self, options: dict) -> str:
        source = options.get("source", {})
        value = str(source.get("url", "")).strip()
        if value.startswith("local-upload:"):
            name = value.removeprefix("local-upload:")
            path = (self.uploads / name).resolve()
            if path.parent != self.uploads or not path.is_file():
                raise ValueError("O vídeo enviado não foi encontrado. Escolha o arquivo novamente.")
            source_type = "upload"
        else:
            validate_url(value)
            source_type = "link"
        if options.get("output_format", "vertical") not in {"vertical", "vertical_fit", "original"}:
            raise ValueError("Formato de vídeo inválido.")
        if options.get("clip_length", "auto") not in {"auto", "short", "medium", "long"}:
            raise ValueError("Duração de clipe inválida.")
        with self.lock:
            if sum(j["status"] in {"queued", "processing"} for j in self.jobs.values()) >= 5:
                raise ValueError("Já há cinco vídeos na fila. Aguarde um terminar.")
            job_id = uuid.uuid4().hex
            folder = self.jobs_dir / job_id
            folder.mkdir()
            now = datetime.now(timezone.utc).isoformat()
            job = {"id": job_id, "source_title": str(source.get("title") or "Seu novo vídeo")[:500], "source_type": source_type, "source_url": value, "created_at": now, "updated_at": now, "status": "queued", "stage": "Na fila", "progress": 0, "clips_count": 0, "clips": [], "error": None, "options": options}
            self.jobs[job_id] = job
            self.events[job_id] = threading.Event()
            self._save(job)
            self.queue.put(job_id)
            return job_id

    def cancel(self, job_id: str):
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                raise ValueError("Projeto não encontrado.")
            if job["status"] in {"queued", "processing"}:
                self.events[job_id].set()
                if self.process and self.process[0] == job_id:
                    self.process[1].terminate()
                self.update(job, stage="Cancelando…")

    def retry(self, job_id: str) -> str:
        job = self.get(job_id)
        if job["status"] not in {"failed", "cancelled"}:
            raise ValueError("Este projeto não precisa ser reiniciado.")
        return self.create(job["options"])

    def _check(self, job: dict):
        if self.stopping.is_set() or self.events[job["id"]].is_set():
            raise Cancelled()

    def _worker(self):
        while not self.stopping.is_set():
            job_id = self.queue.get()
            if job_id is None:
                break
            job = self.jobs[job_id]
            try:
                self._check(job)
                self.update(job, status="processing", stage="Preparando seu vídeo", progress=2, error=None)
                self._run(job)
                self.update(job, status="completed", stage="Seus clipes estão prontos", progress=100, clips_count=len(job["clips"]))
            except Cancelled:
                self.update(job, status="cancelled", stage="Cancelado", error="Você cancelou este processamento.")
            except Exception as cause:
                if self.events[job_id].is_set() or self.stopping.is_set():
                    self.update(job, status="cancelled", stage="Cancelado", error="O processamento foi interrompido.")
                else:
                    LOG.exception("Project failed %s", job_id)
                    self.update(job, status="failed", stage="Não consegui concluir este vídeo", error=self._friendly_error(cause))

    @staticmethod
    def _friendly_error(cause: Exception) -> str:
        raw = str(cause)
        if isinstance(cause, ValueError):
            return raw[:700]
        if re.search(r"sign in|bot|403|private|unavailable|restricted|cookies|requested format|PO Token", raw, re.I):
            return "O site não liberou o download deste vídeo. Alguns links exigem login ou são bloqueados pelo YouTube. Baixe seu próprio vídeo e use Enviar arquivo."
        if re.search(r"network|connection|timed out|resolve|certificate", raw, re.I):
            return "Não consegui acessar o vídeo. Confira a internet e tente novamente, ou escolha um arquivo do computador."
        if isinstance(cause, OSError) and cause.errno == 28:
            return "O disco ficou sem espaço. Libere espaço e tente novamente."
        return "Não consegui processar este vídeo. Tente um arquivo MP4 com áudio. Os detalhes estão no registro do programa, em Configurações."

    def _download(self, job: dict, folder: Path) -> Path:
        from yt_dlp import YoutubeDL
        self.update(job, stage="Baixando seu vídeo", progress=3)

        def progress(data: dict):
            self._check(job)
            if data.get("status") == "downloading":
                total = data.get("total_bytes") or data.get("total_bytes_estimate") or 0
                done = data.get("downloaded_bytes", 0)
                if done > MAX_BYTES:
                    raise ValueError("O vídeo ultrapassou o limite de 8 GB. Escolha um vídeo menor.")
                self.update(job, progress=min(20, 3 + int(17 * done / total)) if total else 5)

        node = self.resources / "tools" / "node.exe"
        options = {"format": "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/b[height<=1080]", "outtmpl": str(folder / "source.%(ext)s"), "ffmpeg_location": self.ffmpeg, "merge_output_format": "mp4", "noplaylist": True, "max_filesize": MAX_BYTES, "socket_timeout": 30, "retries": 3, "quiet": True, "no_warnings": True, "progress_hooks": [progress], "windowsfilenames": True, "overwrites": False}
        if node.is_file():
            options["js_runtimes"] = {"node": {"path": str(node)}}
        def allowed(info, *, incomplete=False):
            self._check(job)
            if info.get("is_live") or info.get("live_status") in {"is_live", "is_upcoming"}:
                return "Transmissões ao vivo não são suportadas. Use um vídeo gravado."
            if (info.get("duration") or 0) > MAX_SECONDS:
                return "Escolha um vídeo de até quatro horas."
            return None
        options["match_filter"] = allowed
        with YoutubeDL(options) as downloader:
            info = downloader.extract_info(job["source_url"], download=True)
            if not info:
                raise ValueError("Não consegui baixar este vídeo. Escolha um vídeo gravado de até quatro horas.")
            self.update(job, source_title=str(info.get("title") or "Vídeo por link")[:500])
            path = Path(info.get("requested_downloads", [{}])[0].get("filepath") or downloader.prepare_filename(info))
        if not path.is_file():
            candidates = [p for p in folder.glob("source.*") if p.suffix in {".mp4", ".mkv", ".webm", ".mov"}]
            if not candidates:
                raise ValueError("O download não gerou um vídeo completo. Tente enviar o arquivo.")
            path = candidates[0]
        return path

    def _ffmpeg(self, job: dict, args: list[str], folder: Path, timeout: int = 3600):
        self._check(job)
        log = folder / "render.log"
        with log.open("ab") as output:
            process = subprocess.Popen([self.ffmpeg, "-hide_banner", "-nostdin", "-y", *args], cwd=str(folder), stdout=subprocess.DEVNULL, stderr=output, creationflags=CREATE_NO_WINDOW)
            self.process = (job["id"], process)
            started = time.monotonic()
            try:
                while process.poll() is None:
                    self._check(job)
                    if time.monotonic() - started > timeout:
                        raise ValueError("A exportação demorou mais que o esperado. Tente um vídeo menor.")
                    time.sleep(0.2)
                self._check(job)
                if process.returncode:
                    raise RuntimeError(f"FFmpeg failed with {process.returncode}; see render.log")
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                self.process = None

    def _run(self, job: dict):
        import av
        folder = self.jobs_dir / job["id"]
        video = self.uploads / job["source_url"].removeprefix("local-upload:") if job["source_type"] == "upload" else self._download(job, folder)
        self._check(job)
        with av.open(str(video)) as media:
            if not media.streams.video or not media.streams.audio:
                raise ValueError("Este arquivo precisa ter imagem e áudio. Escolha um vídeo com voz audível.")
            stream = media.streams.video[0]
            width, height = stream.width, stream.height
            duration = float(media.duration / av.time_base) if media.duration else float(stream.duration * stream.time_base) if stream.duration else 0
        if duration < 3 or duration > MAX_SECONDS:
            raise ValueError("Escolha um vídeo entre três segundos e quatro horas.")
        if shutil.disk_usage(self.data).free < max(1_000_000_000, video.stat().st_size // 2):
            raise ValueError("Não há espaço suficiente no disco para criar os clipes. Libere pelo menos 1 GB.")
        self.update(job, duration=duration, stage="Preparando o áudio", progress=22)
        audio = folder / "audio.wav"
        self._ffmpeg(job, ["-i", str(video), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(audio)], folder)
        if self.model is None:
            self.update(job, stage="Carregando a transcrição local", progress=25)
            from faster_whisper import WhisperModel
            model_path = self.resources / "models" / "whisper-small"
            if not (model_path / "model.bin").is_file():
                raise ValueError("O modelo de voz está ausente. Use o executável completo do DGCLIPS.")
            self.model = WhisperModel(str(model_path), device="cpu", compute_type="int8", cpu_threads=max(2, min(8, (os.cpu_count() or 4) // 2)), num_workers=1, local_files_only=True)
        self.update(job, stage="Transcrevendo a fala no seu computador", progress=27)
        result, info = self.model.transcribe(str(audio), beam_size=3, word_timestamps=True, vad_filter=True, condition_on_previous_text=False)
        segments = []
        for segment in result:
            self._check(job)
            segments.append({"start": segment.start, "end": segment.end, "text": segment.text, "words": [{"start": word.start, "end": word.end, "word": word.word} for word in segment.words or []]})
            self.update(job, progress=min(70, 27 + int(43 * segment.end / duration)))
        (folder / "transcript.json").write_text(json.dumps({"language": info.language, "segments": segments}, ensure_ascii=False, indent=2), encoding="utf-8")
        self.update(job, stage="Encontrando trechos completos na conversa", progress=72, language=info.language)
        options = job["options"]
        suggestions = suggest_clips(segments, duration, options.get("clip_length", "auto"))
        output_format = options.get("output_format", "vertical")
        # Fit preserves speakers at the edges; center crop is an explicit option.
        if output_format == "original":
            out_w, out_h = max(2, round(min(width, 1920) / 2) * 2), max(2, round(height * min(1, 1920 / width) / 2) * 2)
            base_filter = f"scale={out_w}:{out_h},setsar=1"
        elif output_format == "vertical_fit":
            out_w, out_h = 720, 1280
            base_filter = "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=0x080f20,setsar=1"
        else:
            out_w, out_h = 720, 1280
            base_filter = "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1"
        for index, candidate in enumerate(suggestions):
            self._check(job)
            self.update(job, stage=f"Criando clipe {index+1} de {len(suggestions)}", progress=75 + int(23 * index / len(suggestions)))
            name = f"clipe-{index+1:02d}"
            ass_name = name + ".ass"
            (folder / ass_name).write_text(make_ass(segments, candidate["start"], candidate["end"], out_w, out_h, options.get("caption_template", "default")), encoding="utf-8-sig")
            filters = base_filter
            if options.get("add_subtitles", True):
                filters += f",subtitles={ass_name}"
            destination = folder / (name + ".mp4")
            length = candidate["end"] - candidate["start"]
            self._ffmpeg(job, ["-ss", str(candidate["start"]), "-i", str(video), "-t", str(length), "-map", "0:v:0", "-map", "0:a:0", "-vf", filters, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(destination)], folder)
            clip = {"id": name, "title": " ".join(candidate["text"].split()[:10]).rstrip(".,;:") + "…", "start": candidate["start"], "end": candidate["end"], "duration": length, "text": candidate["text"], "filename": destination.name}
            with self.lock:
                job["clips"].append(clip)
            self.update(job, clips_count=len(job["clips"]))
        # Remove the extracted WAV after a successful run, preserve the input and captions.
        audio.unlink(missing_ok=True)

    def close(self):
        self.stopping.set()
        with self.lock:
            for event in self.events.values():
                event.set()
            if self.process:
                self.process[1].terminate()
        self.queue.put(None)
