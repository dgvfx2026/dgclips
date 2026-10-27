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

from clipping import suggest_clips
from captions import make_captions
from editorial import select_moments
from editorial_runtime import EditorialRuntime
from downloading import download_video
from sources import Sources
from studio_options import validate_options
from reframing import filter_plan, probe

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
        self.voice = json.loads((self.resources / 'model-manifest.json').read_text(encoding='utf-8'))
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
        self.active_id = None
        self.editorial = EditorialRuntime(self.data, self.resources)
        self.sources = Sources(self.data, self.resources, self.uploads, self._download_source)
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
        for job in sorted(self.jobs.values(), key=lambda item: item['created_at'], reverse=True)[:10]:
            if job['status'] != 'completed' or job['source_url'].startswith('prepared:'):
                continue
            folder = self.jobs_dir / job['id']
            transcript = folder / 'transcript.json'
            video = self.uploads / job['source_url'].removeprefix('local-upload:') if job['source_type'] == 'upload' else folder / 'source.mp4'
            if video.is_file() and transcript.is_file() and video.resolve().is_relative_to(self.data):
                self.sources.import_project(job, video, transcript)

    @property
    def voice_model_path(self) -> Path:
        return self.resources / 'models' / self.voice['directory']

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
        options = validate_options(options)
        source = options.get("source", {})
        if not isinstance(source, dict):
            raise ValueError("Adicione um vídeo válido.")
        value = str(source.get("url", "")).strip()
        if value.startswith("prepared:"):
            prepared = self.sources.get(value.removeprefix("prepared:"), private=True)
            if prepared['status'] != 'ready' or not Path(prepared['path']).is_file():
                raise ValueError('Prepare a prévia do vídeo novamente.')
            source_type = 'upload' if prepared.get('url', '').startswith('local-upload:') else 'link'
            source['title'] = prepared['title']
            if options['layout'].startswith('react_') and not options.get('camera_rect'):
                options['camera_rect'] = prepared.get('camera_rect')
        elif value.startswith("local-upload:"):
            name = value.removeprefix("local-upload:")
            path = (self.uploads / name).resolve()
            if path.parent != self.uploads or not path.is_file():
                raise ValueError("O vídeo enviado não foi encontrado. Escolha o arquivo novamente.")
            source_type = "upload"
        else:
            validate_url(value)
            source_type = "link"
        options = validate_options(options, require_camera=True)
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
                if self.active_id == job_id:
                    self.editorial.close()
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
            self.active_id = job_id
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

            finally:
                self.editorial.close()
                self.active_id = None

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

    def _download_source(self, url, folder, progress, check):
        return download_video(url, folder, self.ffmpeg, self.resources / 'tools/node.exe', progress, check)

    def _download(self, job: dict, folder: Path) -> Path:
        def progress(stage, percent, title=None):
            values = {'stage': stage, 'progress': 3 + int(percent * .17)}
            if title:
                values['source_title'] = title
            self.update(job, **values)
        return self._download_source(job['source_url'], folder, progress, lambda: self._check(job))

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
        folder = self.jobs_dir / job['id']
        options = job['options']
        prepared = None
        if job['source_url'].startswith('prepared:'):
            prepared = self.sources.get(job['source_url'].removeprefix('prepared:'), private=True)
            video = Path(prepared['path'])
        elif job['source_type'] == 'upload':
            video = self.uploads / job['source_url'].removeprefix('local-upload:')
        else:
            video = self._download(job, folder)
        self._check(job)
        metadata = probe(video)
        duration, width, height = metadata['duration'], metadata['width'], metadata['height']
        if duration < 3 or duration > MAX_SECONDS:
            raise ValueError('Escolha um vídeo entre três segundos e quatro horas.')
        if shutil.disk_usage(self.data).free < max(1_000_000_000, video.stat().st_size // 2):
            raise ValueError('Não há espaço suficiente no disco para criar os clipes.')
        transcript_file = self.sources.root / prepared['id'] / 'transcript.json' if prepared else folder / 'transcript.json'
        transcript = json.loads(transcript_file.read_text(encoding='utf-8')) if transcript_file.is_file() else None
        if transcript and transcript.get('model_revision') == self.voice['revision']:
            segments, language = transcript['segments'], transcript['language']
            self.update(job, duration=duration, stage='Reutilizando a transcrição deste vídeo', progress=62)
        else:
            self.update(job, duration=duration, stage='Preparando o áudio', progress=22)
            audio = folder / 'audio.wav'
            self._ffmpeg(job, ['-i', str(video), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', str(audio)], folder)
            if self.model is None:
                self.update(job, stage='Carregando a transcrição local', progress=25)
                from faster_whisper import WhisperModel
                model_path = self.voice_model_path
                if not (model_path / 'model.bin').is_file():
                    raise ValueError('O modelo de voz está ausente. Use o instalador completo do DGCLIPS.')
                self.model = WhisperModel(str(model_path), device='cpu', compute_type='int8', cpu_threads=max(2, min(8, (os.cpu_count() or 4) // 2)), num_workers=1, local_files_only=True)
            self.update(job, stage='Transcrevendo a fala no seu computador', progress=27)
            result, info = self.model.transcribe(str(audio), beam_size=5, word_timestamps=True, vad_filter=True, condition_on_previous_text=False, initial_prompt=str(job['source_title'])[:350])
            segments = []
            for segment in result:
                self._check(job)
                segments.append({'start': segment.start, 'end': segment.end, 'text': segment.text, 'words': [{'start': word.start, 'end': word.end, 'word': word.word} for word in segment.words or []]})
                self.update(job, progress=min(62, 27 + int(35 * segment.end / duration)))
            language = info.language
            transcript_file.write_text(json.dumps({'language': language, 'segments': segments, 'model_revision': self.voice['revision']}, ensure_ascii=False, indent=2), encoding='utf-8')
            audio.unlink(missing_ok=True)
        if transcript_file != folder / 'transcript.json':
            shutil.copy2(transcript_file, folder / 'transcript.json')
        self.update(job, language=language, stage='Preparando a curadoria de conteúdo', progress=64)
        if options.get('selection_mode') == 'rules':
            from editorial import requested_count
            count = requested_count(options.get('clip_count'), duration)
            suggestions = suggest_clips(segments, duration, options['clip_length'], count)
            summary = {'requested': count, 'found': len(suggestions), 'note': 'Modo rápido por regras. Não usa análise editorial.'}
        else:
            def progress(stage, fraction, detail):
                self.update(job, stage=stage, progress=64 + round(18 * fraction), analysis_detail=detail)
            suggestions, summary = select_moments(self.editorial, segments, duration, options, progress, lambda: self._check(job))
        self.editorial.close()
        self.update(job, editorial=summary, analysis_detail={})
        fonts = folder / 'fonts'
        fonts.mkdir(exist_ok=True)
        for font in (self.resources / 'fonts').glob('*.ttf'):
            target = fonts / font.name
            if not target.is_file():
                try:
                    os.link(font, target)
                except OSError:
                    shutil.copy2(font, target)
        for index, candidate in enumerate(suggestions):
            self._check(job)
            self.update(job, stage=f'Criando clipe {index+1} de {len(suggestions)}', progress=84 + int(15 * index / len(suggestions)))
            name = f'clipe-{index+1:02d}'
            _, out_w, out_h = filter_plan(width, height, options)
            ass_name = name + '.ass'
            (folder / ass_name).write_text(make_captions(segments, candidate['start'], candidate['end'], out_w, out_h, options), encoding='utf-8-sig')
            graph, _, _ = filter_plan(width, height, options, ass_name if options['add_subtitles'] else None)
            destination = folder / (name + '.mp4')
            length = candidate['end'] - candidate['start']
            self._ffmpeg(job, ['-ss', str(candidate['start']), '-i', str(video), '-t', str(length), '-filter_complex', graph, '-map', '[outv]', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(destination)], folder)
            clip = {'id': name, 'title': candidate.get('title') or ' '.join(candidate['text'].split()[:10]).rstrip('.,;:') + '…', 'start': candidate['start'], 'end': candidate['end'], 'duration': length, 'text': candidate['text'], 'filename': destination.name, 'reason': candidate.get('reason'), 'kind': candidate.get('kind'), 'editorial_rank': candidate.get('editorial_rank'), 'caption_template': options['caption_template'], 'layout': options['layout']}
            clip.update(evidence=candidate.get('evidence'), reviewed=candidate.get('reviewed', False))
            with self.lock:
                job['clips'].append(clip)
            self.update(job, clips_count=len(job['clips']))
        if prepared is None:
            self.sources.import_project(job, video, transcript_file)

    def close(self):
        self.stopping.set()
        self.editorial.close()
        self.sources.close()
        with self.lock:
            for event in self.events.values():
                event.set()
            if self.process:
                self.process[1].terminate()
        self.queue.put(None)
