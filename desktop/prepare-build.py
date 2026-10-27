"""Assemble the exact runtime licenses, binary and icon before freezing."""
from __future__ import annotations

import importlib.metadata
import json
import shutil
import subprocess
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
licenses = root / 'licenses'
licenses.mkdir(exist_ok=True)
shutil.copytree(root / 'third-party-licenses', licenses / 'editorial', dirs_exist_ok=True)
for notice in (root / 'tools/llama').glob('LICENSE*'):
    shutil.copy2(notice, licenses / 'editorial' / notice.name)
manifest = []
for distribution in importlib.metadata.distributions():
    name = distribution.metadata.get('Name') or 'unknown'
    if name.lower() == 'pip':
        continue
    item = {'name': name, 'version': distribution.version, 'home': distribution.metadata.get('Home-page'), 'project_urls': distribution.metadata.get_all('Project-URL') or [], 'license': distribution.metadata.get('License-Expression') or distribution.metadata.get('License')}
    manifest.append(item)
    for file in distribution.files or []:
        if file.name.lower().startswith(('license', 'copying', 'notice', 'authors')) or '/licenses/' in file.as_posix():
            source = Path(distribution.locate_file(file))
            if source.is_file() and source.stat().st_size < 1_000_000:
                target = licenses / name / file.name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
(licenses / 'python-packages.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
(root / 'requirements-lock.txt').write_text('\n'.join(sorted(f"{item['name']}=={item['version']}" for item in manifest)) + '\n', encoding='utf-8')
tools = root / 'tools'
tools.mkdir(exist_ok=True)
shutil.copy2(imageio_ffmpeg.get_ffmpeg_exe(), tools / 'ffmpeg.exe')
config = subprocess.run([str(tools / 'ffmpeg.exe'), '-version'], capture_output=True, text=True, check=True).stdout
(licenses / 'ffmpeg-build.txt').write_text(config + '\nBinary distribution: https://github.com/imageio/imageio-ffmpeg\nBuild sources: https://github.com/BtbN/FFmpeg-Builds\nFFmpeg source (7.1): https://ffmpeg.org/releases/ffmpeg-7.1.tar.xz\n', encoding='utf-8')
shutil.copy2(Path(__import__('sys').base_prefix) / 'LICENSE.txt', licenses / 'Python-LICENSE.txt')
image = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((7, 7, 249, 249), radius=64, fill='#081429', outline='#5f9ae7', width=3)
draw.rounded_rectangle((16, 15, 240, 241), radius=58, outline='#233d63', width=2)
draw.ellipse((45, 45, 211, 211), fill='#193b6d', outline='#7bcaff', width=3)
draw.polygon([(110, 85), (110, 171), (175, 128)], fill='#cbeeff')
draw.line([(60, 192), (127, 211), (200, 190)], fill='#68b6ff', width=5)
image.save(root / 'DGCLIPS.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('Runtime assets, icon, dependency manifest and licenses prepared.')
