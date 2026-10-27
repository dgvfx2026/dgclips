"""Prepare reusable local sources and framing previews before expensive processing."""
from __future__ import annotations

import json
import shutil
import threading
import uuid
import queue
from pathlib import Path

from reframing import get_frame, probe, suggest_camera


class Sources:
    def __init__(self, data: Path, resources: Path, uploads: Path, download):
        self.root = data / 'Fontes'
        self.root.mkdir(exist_ok=True)
        self.resources, self.uploads, self.download = resources, uploads, download
        self.records = {}
        self.lock = threading.RLock()
        self.pending = queue.Queue()
        self.cancel_events = {}
        self.stopping = threading.Event()
        for number in range(2):
            threading.Thread(target=self._worker, name=f'DGCLIPS-preview-{number}', daemon=True).start()
        for state in self.root.glob('*/source.json'):
            try:
                record = json.loads(state.read_text(encoding='utf-8'))
                if record['status'] == 'preparing':
                    record.update(status='failed', error='A preparação foi interrompida. Adicione o vídeo novamente.')
                self.records[record['id']] = record
            except (ValueError, OSError, KeyError):
                continue

    def _save(self, record):
        path = self.root / record['id'] / 'source.json'
        temp = path.with_suffix('.tmp')
        temp.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
        temp.replace(path)

    def get(self, source_id: str, private: bool = False):
        with self.lock:
            if source_id not in self.records:
                raise ValueError('Vídeo não encontrado. Adicione o vídeo novamente.')
            record = dict(self.records[source_id])
            if not private:
                record.pop('path', None)
                record.pop('url', None)
                record.pop('transcript_path', None)
            return record

    def create(self, url: str, title: str | None = None):
        with self.lock:
            if sum(item['status'] == 'preparing' for item in self.records.values()) >= 4:
                raise ValueError('Já há vídeos sendo preparados. Aguarde um deles terminar.')
            for record in self.records.values():
                if record.get('url') == url and record['status'] == 'ready' and Path(record['path']).is_file():
                    return record['id']
            source_id = uuid.uuid4().hex
            (self.root / source_id).mkdir()
            record = {'id': source_id, 'url': url, 'title': (title or 'Seu vídeo')[:500], 'status': 'preparing', 'stage': 'Preparando prévia', 'progress': 0, 'error': None}
            self.records[source_id] = record
            self._save(record)
            self.cancel_events[source_id] = threading.Event()
            self.pending.put(record)
            return source_id

    def _worker(self):
        while not self.stopping.is_set():
            try:
                record = self.pending.get(timeout=.5)
            except queue.Empty:
                continue
            self._prepare(record)

    def cancel(self, source_id):
        event = self.cancel_events.get(source_id)
        if event:
            event.set()

    def import_project(self, job: dict, video: Path, transcript: Path):
        cache_key = 'project-cache:' + job['source_url']
        with self.lock:
            if any(record.get('url') == cache_key for record in self.records.values()):
                return
            source_id = uuid.uuid4().hex
            (self.root / source_id).mkdir()
            record = {'id': source_id, 'url': cache_key, 'path': str(video), 'transcript_path': str(transcript), 'title': job['source_title'], 'status': 'preparing', 'stage': 'Preparando vídeo já importado', 'progress': 0, 'error': None}
            self.records[source_id] = record
            self.cancel_events[source_id] = threading.Event()
            self._save(record)
            self.pending.put(record)

    def _prepare(self, record):
        try:
            folder = self.root / record['id']
            if record.get('path') and Path(record['path']).is_file():
                path = Path(record['path'])
            elif record['url'].startswith('local-upload:'):
                path = (self.uploads / record['url'].removeprefix('local-upload:')).resolve()
                if path.parent != self.uploads or not path.is_file():
                    raise ValueError('O vídeo enviado não foi encontrado.')
            else:
                def progress(stage, percent, title=None):
                    with self.lock:
                        record.update(stage=stage, progress=percent)
                        if title:
                            record['title'] = title
                        self._save(record)
                path = self.download(record['url'], folder, progress, lambda: self._check(record['id']))
            self._check(record['id'])
            metadata = probe(path)
            if not 3 <= metadata['duration'] <= 4*3600:
                raise ValueError('Escolha um vídeo entre três segundos e quatro horas.')
            image = get_frame(path, min(30, metadata['duration'] * .2))
            image.save(folder / 'preview.jpg', quality=88)
            transcript = record.get('transcript_path')
            if transcript and Path(transcript).is_file():
                shutil.copy2(transcript, folder / 'transcript.json')
            try:
                camera = suggest_camera(image, self.resources)
            except Exception:
                # Manual framing remains available if face suggestions are unavailable.
                camera = None
            with self.lock:
                record.update(**metadata, path=str(path), camera_rect=camera, content_rect={'x': 0, 'y': 0, 'w': 1, 'h': 1}, status='ready', stage='Prévia pronta', progress=100)
                self._save(record)
        except Exception as cause:
            with self.lock:
                record.update(status='failed', stage='Não consegui preparar a prévia', error=str(cause)[:700])
                self._save(record)

    def _check(self, source_id):
        if self.stopping.is_set() or self.cancel_events[source_id].is_set():
            raise ValueError('A preparação foi interrompida.')

    def close(self):
        self.stopping.set()
