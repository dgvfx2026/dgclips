"""Loopback-only desktop HTTP bridge with per-launch authentication and byte ranges."""
from __future__ import annotations

import json
import mimetypes
import re
import secrets
import shutil
import uuid
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from engine import Engine, MAX_BYTES


class DesktopServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, engine: Engine, ui: Path, port: int = 0):
        super().__init__(("127.0.0.1", port), Handler)
        self.engine = engine
        self.ui = ui.resolve()
        self.token = secrets.token_urlsafe(40)
        self.origin = f"http://127.0.0.1:{self.server_port}"

    @property
    def start_url(self):
        return f"{self.origin}/start?token={self.token}"


class Handler(BaseHTTPRequestHandler):
    server: DesktopServer
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        # Don't log URLs: the initial URL contains the per-launch secret.
        pass

    def _auth(self):
        if self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}":
            self._json({"error": "Endereço não permitido."}, 403)
            return False
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
            supplied = cookie.get("dgclips-desktop")
            valid = supplied and secrets.compare_digest(supplied.value, self.server.token)
        except Exception:
            valid = False
        if not valid:
            self._json({"error": "Abra o DGCLIPS pelo ícone do programa."}, 401)
            return False
        if self.command == "POST" and self.headers.get("Origin") != self.server.origin:
            self._json({"error": "Origem não permitida."}, 403)
            return False
        return True

    def _headers(self, code: int, content_type: str, size: int, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()

    def _json(self, payload, code=200):
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._headers(code, "application/json; charset=utf-8", len(encoded))
        self.wfile.write(encoded)

    def _file(self, path: Path, *, download=False):
        size = path.stat().st_size
        start, end, code = 0, size - 1, 200
        extra = {"Accept-Ranges": "bytes"}
        requested = self.headers.get("Range")
        if requested:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested)
            if not match or not any(match.groups()):
                self._headers(416, "text/plain", 0, {"Content-Range": f"bytes */{size}"})
                return
            first, last = match.groups()
            if first:
                start = int(first)
                end = min(size - 1, int(last)) if last else size - 1
            else:
                start = max(0, size - int(last))
            if start >= size or end < start:
                self._headers(416, "text/plain", 0, {"Content-Range": f"bytes */{size}"})
                return
            code = 206
            extra["Content-Range"] = f"bytes {start}-{end}/{size}"
        if download:
            extra["Content-Disposition"] = f'attachment; filename="DGCLIPS-{path.name}"'
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self._headers(code, content_type, end - start + 1, extra)
        with path.open("rb") as stream:
            stream.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                part = stream.read(min(1024 * 1024, remaining))
                if not part:
                    break
                self.wfile.write(part)
                remaining -= len(part)

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            path = unquote(parsed.path)
            if path == "/start":
                supplied = parse_qs(parsed.query).get("token", [""])[0]
                if self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}" or not secrets.compare_digest(supplied, self.server.token):
                    return self._json({"error": "Acesso não autorizado."}, 401)
                self._headers(303, "text/plain", 0, {"Location": "/", "Set-Cookie": f"dgclips-desktop={self.server.token}; Path=/; HttpOnly; SameSite=Strict"})
                return
            if not self._auth():
                return
            if path in {"/api/tasks", "/api/tasks/"}:
                return self._json({"tasks": self.server.engine.list()})
            if path == "/api/desktop/status":
                return self._json({"version": "1.1.0", "data_dir": str(self.server.engine.data), "model": "Whisper small · CPU local", "model_ready": (self.server.engine.resources / "models/whisper-small/model.bin").is_file(), "free_gb": round(shutil.disk_usage(self.server.engine.data).free / 1e9, 1), "selection": "Sugestões por transcrição, densidade de fala e frases completas"})
            match = re.fullmatch(r"/api/tasks/([a-f0-9]{32})", path)
            if match:
                return self._json(self.server.engine.get(match[1]))
            match = re.fullmatch(r"/api/tasks/([a-f0-9]{32})/clips/(clipe-\d{2})/file", path)
            if match:
                job = self.server.engine.get(match[1])
                clip = next((clip for clip in job["clips"] if clip["id"] == match[2]), None)
                if not clip:
                    return self._json({"error": "Clipe não encontrado."}, 404)
                return self._file(self.server.engine.jobs_dir / job["id"] / clip["filename"], download="download" in parse_qs(parsed.query, keep_blank_values=True))
            if path.startswith("/api/"):
                return self._json({"error": "Rota não encontrada."}, 404)
            candidate = (self.server.ui / path.lstrip("/")).resolve()
            if not candidate.is_relative_to(self.server.ui):
                return self._json({"error": "Arquivo não encontrado."}, 404)
            if candidate.is_file():
                return self._file(candidate)
            if "." in Path(path).name:
                return self._json({"error": "Arquivo não encontrado."}, 404)
            return self._file(self.server.ui / "index.html")
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except (ValueError, FileNotFoundError) as cause:
            self._json({"error": str(cause)}, 404)

    def do_POST(self):
        if not self._auth():
            self.close_connection = True
            return
        try:
            parsed = urlparse(self.path)
            size = int(self.headers.get("Content-Length", "0"))
            self.connection.settimeout(300)
            if parsed.path == "/api/desktop/upload":
                if size <= 0 or size > MAX_BYTES:
                    self.close_connection = True
                    return self._json({"error": "Escolha um vídeo de até 8 GB."}, 413)
                suffix = Path(parse_qs(parsed.query).get("name", ["video.mp4"])[0]).suffix.lower()
                if suffix not in {".mp4", ".mov", ".webm", ".mkv", ".m4v"}:
                    self.close_connection = True
                    return self._json({"error": "Formato de vídeo não suportado."}, 400)
                if shutil.disk_usage(self.server.engine.data).free < size + 1_000_000_000:
                    self.close_connection = True
                    return self._json({"error": "Não há espaço no disco para este vídeo e seus clipes."}, 400)
                destination = self.server.engine.uploads / (uuid.uuid4().hex + suffix)
                try:
                    with destination.open("xb") as output:
                        remaining = size
                        while remaining:
                            part = self.rfile.read(min(1024 * 1024, remaining))
                            if not part:
                                raise ValueError("O envio foi interrompido. Escolha seu vídeo novamente.")
                            output.write(part)
                            remaining -= len(part)
                except Exception:
                    destination.unlink(missing_ok=True)
                    raise
                return self._json({"video_path": "local-upload:" + destination.name})
            if size > 65536 or size <= 0:
                self.close_connection = True
                return self._json({"error": "Solicitação inválida."}, 400)
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError("Solicitação inválida.")
            if parsed.path == "/api/tasks/create":
                return self._json({"task_id": self.server.engine.create(body)}, 201)
            match = re.fullmatch(r"/api/tasks/([a-f0-9]{32})/(cancel|retry)", parsed.path)
            if match:
                if match[2] == "cancel":
                    self.server.engine.cancel(match[1])
                    return self._json({"ok": True})
                return self._json({"task_id": self.server.engine.retry(match[1])}, 201)
            return self._json({"error": "Rota não encontrada."}, 404)
        except (ValueError, TypeError, KeyError) as cause:
            self._json({"error": str(cause)}, 400)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except OSError:
            self._json({"error": "Não consegui salvar o vídeo. Confira o espaço e as permissões da pasta."}, 500)
