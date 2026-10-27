"""Fetch pinned editorial/face binaries for a Windows build; verify before extraction."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import ssl
import urllib.request
import zipfile
import zlib
from pathlib import Path

import certifi

ROOT = Path(__file__).resolve().parent


def download(url: str, target: Path, expected: str):
    def checksum(path):
        digest = hashlib.sha256()
        with path.open('rb') as stream:
            for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
                digest.update(block)
        return digest.hexdigest()

    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file() and checksum(target) == expected:
        return
    partial = target.with_suffix('.partial')
    try:
        context = ssl.create_default_context(cafile=certifi.where())
        with urllib.request.urlopen(url, context=context, timeout=90) as response, partial.open('wb') as output:
            shutil.copyfileobj(response, output, length=2 * 1024 * 1024)
        if checksum(partial) != expected:
            raise RuntimeError('SHA-256 mismatch: ' + target.name)
        partial.replace(target)
    finally:
        partial.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--with-model', action='store_true', help='Also cache the 2.5 GB model for development; it is excluded from the installer')
    args = parser.parse_args()
    assets = json.loads((ROOT / 'editorial-assets.json').read_text(encoding='utf-8'))
    archive = ROOT / 'tools' / ('llama-' + assets['runtime']['version'] + '.zip')
    download(assets['runtime']['url'], archive, assets['runtime']['sha256'])
    destination = (ROOT / 'tools/llama').resolve()
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as package:
        for member in package.infolist():
            target = (destination / member.filename).resolve()
            if not target.is_relative_to(destination) or member.filename.startswith(('/', '\\')):
                raise RuntimeError('Unsafe path in runtime archive')
        for member in package.infolist():
            target = destination / member.filename
            if target.is_file() and target.stat().st_size == member.file_size:
                with target.open('rb') as stream:
                    crc = 0
                    for block in iter(lambda: stream.read(1024 * 1024), b''):
                        crc = zlib.crc32(block, crc)
                if crc == member.CRC:
                    continue
            package.extract(member, destination)
    if not (destination / 'llama-server.exe').is_file():
        raise RuntimeError('Editorial server is missing from the verified runtime')
    face = json.loads((ROOT / 'face-manifest.json').read_text(encoding='utf-8'))
    download(face['url'], ROOT / 'models/face/yunet.onnx', face['sha256'])
    if args.with_model:
        model = assets['model']
        download(f"https://huggingface.co/{model['repository']}/resolve/{model['revision']}/{model['filename']}", ROOT / 'models/editorial' / model['filename'], model['sha256'])
    print('Verified editorial runtime and face model prepared.')


if __name__ == '__main__':
    main()
