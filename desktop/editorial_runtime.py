"""Private, bundled llama.cpp process. Transcripts never leave this computer."""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import shutil
import socket
import ssl
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            digest.update(part)
    return digest.hexdigest()


class EditorialRuntime:
    def __init__(self, data: Path, resources: Path):
        self.data = data
        self.resources = resources
        self.assets = json.loads((resources / 'editorial-assets.json').read_text(encoding='utf-8'))
        self.process = None
        self.port = None
        self.key = secrets.token_urlsafe(40)
        self.acceleration = 'Preparando'
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def model_path(self) -> Path:
        model = self.assets['model']
        bundled = self.resources / 'models/editorial' / model['filename']
        if bundled.is_file() and bundled.stat().st_size == model['bytes']:
            return bundled
        return self.data / 'Modelos' / model['filename']

    def ready(self) -> bool:
        path = self.model_path()
        return path.is_file() and path.stat().st_size == self.assets['model']['bytes']

    def prepare(self, update, check):
        target = self.model_path()
        model = self.assets['model']
        if self.ready():
            return target
        target.parent.mkdir(parents=True, exist_ok=True)
        if shutil.disk_usage(target.parent).free < model['bytes'] + 1_000_000_000:
            raise ValueError('A análise de conteúdo precisa de cerca de 3,5 GB livres. Escolha um disco com mais espaço.')
        update('Baixando a IA editorial · uma única vez', 0)
        partial = target.with_suffix('.partial')
        url = f"https://huggingface.co/{model['repository']}/resolve/{model['revision']}/{model['filename']}"
        import certifi
        context = ssl.create_default_context(cafile=certifi.where())
        digest = hashlib.sha256()
        downloaded = 0
        previous = -1
        try:
            with urllib.request.urlopen(url, context=context, timeout=45) as response, partial.open('wb') as stream:
                while True:
                    check()
                    chunk = response.read(2 * 1024 * 1024)
                    if not chunk:
                        break
                    stream.write(chunk)
                    digest.update(chunk)
                    downloaded += len(chunk)
                    percent = min(99, int(downloaded * 100 / model['bytes']))
                    if percent != previous:
                        update('Baixando a IA editorial · uma única vez', percent)
                        previous = percent
            if downloaded != model['bytes'] or digest.hexdigest() != model['sha256']:
                raise ValueError('O modelo de IA não passou na verificação. Tente novamente para baixar uma cópia íntegra.')
            partial.replace(target)
            return target
        except Exception:
            partial.unlink(missing_ok=True)
            raise

    def start(self, update, check):
        model = self.prepare(update, check)
        if self.process and self.process.poll() is None:
            return
        server = self.resources / 'tools/llama/llama-server.exe'
        if not server.is_file():
            raise ValueError('A análise editorial não está incluída nesta versão. Instale a atualização completa do DGCLIPS.')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            self.port = sock.getsockname()[1]
        log_folder = self.data / 'Modelos'
        log_folder.mkdir(exist_ok=True)
        log_path = log_folder / 'editorial-runtime.log'
        devices = subprocess.run([str(server), '--list-devices'], cwd=str(server.parent), capture_output=True, text=True, errors='replace', timeout=15, creationflags=0x08000000 if os.name == 'nt' else 0)
        import re
        device = re.search(r'\b(Vulkan\d+):', devices.stdout + devices.stderr)
        for layers in ('99', '0'):
            check()
            update('Carregando a IA editorial no computador', 100)
            with log_path.open('w', encoding='utf-8') as output:
                arguments = [str(server), '-m', str(model), '--host', '127.0.0.1', '--port', str(self.port), '--api-key', self.key, '--no-webui', '-c', '8192', '-np', '1', '-ngl', layers, '-t', str(min(8, os.cpu_count() or 4)), '--jinja', '--reasoning', 'off']
                if device and layers != '0':
                    arguments += ['--device', device[1]]
                self.process = subprocess.Popen(arguments, cwd=str(server.parent), stdout=output, stderr=subprocess.STDOUT, creationflags=0x08000000 if os.name == 'nt' else 0)
            deadline = time.monotonic() + 100
            while time.monotonic() < deadline:
                check()
                if self.process.poll() is not None:
                    break
                try:
                    request = urllib.request.Request(f'http://127.0.0.1:{self.port}/health', headers={'Authorization': 'Bearer ' + self.key})
                    with self.opener.open(request, timeout=1) as response:
                        if response.status == 200:
                            contents = log_path.read_text(encoding='utf-8', errors='replace')
                            import re
                            self.acceleration = 'GPU · Vulkan' if layers != '0' and device else 'CPU'
                            return
                except (OSError, urllib.error.URLError):
                    pass
                time.sleep(0.25)
            self.close()
        raise ValueError('Não consegui carregar a IA editorial. Feche outros programas pesados e tente novamente. Os detalhes estão no registro do programa.')

    def chat(self, system: str, user: str, schema: dict, check, max_tokens: int = 1800):
        if not self.process or self.process.poll() is not None:
            raise ValueError('A IA editorial foi interrompida. Tente novamente.')
        body = {'model': 'local-editor', 'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}], 'temperature': 0.25, 'top_p': 0.9, 'max_tokens': max_tokens, 'stream': True, 'response_format': {'type': 'json_schema', 'json_schema': {'name': 'editorial', 'strict': True, 'schema': schema}}, 'chat_template_kwargs': {'enable_thinking': False}}
        request = urllib.request.Request(f'http://127.0.0.1:{self.port}/v1/chat/completions', data=json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + self.key, 'Content-Type': 'application/json'})
        parts = []
        with self.opener.open(request, timeout=120) as response:
            for line in response:
                check()
                if not line.startswith(b'data: '):
                    continue
                value = line[6:].strip()
                if value == b'[DONE]':
                    break
                data = json.loads(value)
                for choice in data.get('choices', []):
                    content = choice.get('delta', {}).get('content')
                    if content:
                        parts.append(content)
                    if choice.get('finish_reason') == 'length':
                        raise ValueError('A análise editorial ficou incompleta. Tente novamente com uma duração menor.')
        check()
        try:
            return json.loads(''.join(parts))
        except ValueError as cause:
            raise ValueError('A IA retornou uma análise incompleta. Tente novamente.') from cause

    def close(self):
        process, self.process = self.process, None
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
