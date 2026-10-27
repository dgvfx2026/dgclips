"""Normalized source crops, face-assisted suggestions and full-frame social layouts."""
from __future__ import annotations

import math
from pathlib import Path

LAYOUTS = {'fill', 'fit', 'original', 'react_top', 'react_bottom'}


def rect(value, fallback=None) -> dict:
    if value is None and fallback is not None:
        return dict(fallback)
    if not isinstance(value, dict) or set(value) != {'x', 'y', 'w', 'h'}:
        raise ValueError('Selecione uma área válida do vídeo.')
    if any(type(value[key]) not in (int, float) or not math.isfinite(value[key]) for key in value):
        raise ValueError('O enquadramento contém valores inválidos.')
    x, y, w, h = (float(value[key]) for key in ('x', 'y', 'w', 'h'))
    if x < 0 or y < 0 or w < .04 or h < .04 or x+w > 1.001 or y+h > 1.001:
        raise ValueError('Mantenha as áreas de enquadramento dentro do vídeo.')
    return {'x': x, 'y': y, 'w': min(w, 1-x), 'h': min(h, 1-y)}


def get_frame(video: Path, at: float = 0):
    import av
    with av.open(str(video)) as container:
        container.seek(max(0, round(at * av.time_base)), backward=True)
        for frame in container.decode(video=0):
            if frame.time is None or frame.time >= at:
                return frame.to_image()
    raise ValueError('Não consegui abrir uma imagem deste vídeo.')


def probe(video: Path) -> dict:
    import av
    with av.open(str(video)) as container:
        if not container.streams.video or not container.streams.audio:
            raise ValueError('Escolha um vídeo com imagem e áudio.')
        stream = container.streams.video[0]
        duration = float(container.duration / av.time_base) if container.duration else float(stream.duration * stream.time_base) if stream.duration else 0
        return {'width': stream.width, 'height': stream.height, 'duration': duration}


def suggest_camera(image, resources: Path) -> dict | None:
    import cv2
    import numpy as np
    source_w, source_h = image.size
    ratio = min(1, 960 / source_w)
    sample = cv2.cvtColor(np.array(image.resize((round(source_w*ratio), round(source_h*ratio)))), cv2.COLOR_RGB2BGR)
    height, width = sample.shape[:2]
    faces = []
    model = resources / 'models/face/yunet.onnx'
    if model.is_file():
        detector = cv2.FaceDetectorYN.create(str(model), '', (width, height), .65, .3, 5000)
        _, found = detector.detect(sample)
        for item in found if found is not None else []:
            x, y, w, h = item[:4]
            faces.append({'x': float(x/width), 'y': float(y/height), 'w': float(w/width), 'h': float(h/height)})
    else:
        detector = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        found = detector.detectMultiScale(cv2.cvtColor(sample, cv2.COLOR_BGR2GRAY), scaleFactor=1.1, minNeighbors=5, minSize=(24, 24))
        faces = [{'x': x/width, 'y': y/height, 'w': w/width, 'h': h/height} for x, y, w, h in found]
    if not faces:
        return None
    clusters = []
    for face in faces:
        cluster = [other for other in faces if abs((face['y']+face['h']/2) - (other['y']+other['h']/2)) < max(face['h'], other['h']) * .8 and abs((face['x']+face['w']/2) - (other['x']+other['w']/2)) < max(face['h'], other['h']) * 3.5]
        x = min(item['x'] for item in cluster)
        y = min(item['y'] for item in cluster)
        right = max(item['x']+item['w'] for item in cluster)
        bottom = max(item['y']+item['h'] for item in cluster)
        area = sum(item['w']*item['h'] for item in cluster)
        edge = 1.3 if x > .65 or right < .35 else 1
        clusters.append((area * edge * (1 + .2*(len(cluster)-1)), x, y, right-x, bottom-y))
    _, x, y, w, h = max(clusters)
    # Expand from faces to a camera crop containing heads and upper bodies.
    left = max(0, x - max(w*.17, h*.25))
    top = max(0, y - h*.5)
    right = min(1, x+w+max(w*.17, h*.25))
    bottom = min(1, y+h*2.0)
    desired_h = (right-left) * source_w / source_h / (16/9)
    if bottom-top < desired_h:
        center = (top+bottom)/2
        top = max(0, min(1-desired_h, center-desired_h/2))
        bottom = min(1, top+desired_h)
    return {'x': left, 'y': top, 'w': right-left, 'h': bottom-top}


def pixel_crop(region: dict, width: int, height: int) -> str:
    x = max(0, min(width-2, int(region['x'] * width) // 2 * 2))
    y = max(0, min(height-2, int(region['y'] * height) // 2 * 2))
    w = max(2, min(width-x, int(region['w'] * width) // 2 * 2))
    h = max(2, min(height-y, int(region['h'] * height) // 2 * 2))
    return f'crop={w}:{h}:{x}:{y}'


def filter_plan(width: int, height: int, options: dict, caption_file: str | None = None) -> tuple[str, int, int]:
    layout = options.get('layout') or {'vertical': 'fill', 'vertical_fit': 'fit', 'original': 'original'}.get(options.get('output_format'), 'fill')
    out_w, out_h = (720, 1280) if options.get('resolution') == '720' else (1080, 1920)
    content = rect(options.get('content_rect'), {'x': 0, 'y': 0, 'w': 1, 'h': 1})
    source_crop = pixel_crop(content, width, height)
    if layout == 'original':
        out_w = max(2, int(min(width, 1920)) // 2 * 2)
        out_h = max(2, int(height * min(1, 1920/width)) // 2 * 2)
        graph = f'[0:v]scale={out_w}:{out_h},setsar=1[layout]'
    elif layout.startswith('react_'):
        camera = rect(options.get('camera_rect'))
        camera_h = int(out_h * options.get('camera_share', .32)) // 2 * 2
        content_h = out_h - camera_h
        camera_filter = pixel_crop(camera, width, height)
        cover = lambda w, h: f'scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h},setsar=1'
        graph = f'[0:v]split=2[cam][main];[cam]{camera_filter},{cover(out_w,camera_h)}[camera];[main]{source_crop},{cover(out_w,content_h)}[content];'
        graph += '[camera][content]vstack=inputs=2[layout]' if layout == 'react_top' else '[content][camera]vstack=inputs=2[layout]'
    elif layout == 'fit':
        graph = f'[0:v]split=2[bg][fg];[bg]scale={out_w}:{out_h}:force_original_aspect_ratio=increase,crop={out_w}:{out_h},boxblur=25:2,setsar=1[blur];[fg]{source_crop},scale={out_w}:{out_h}:force_original_aspect_ratio=decrease:flags=lanczos,setsar=1[front];[blur][front]overlay=(W-w)/2:(H-h)/2[layout]'
    else:
        graph = f'[0:v]{source_crop},scale={out_w}:{out_h}:force_original_aspect_ratio=increase:flags=lanczos,crop={out_w}:{out_h},setsar=1[layout]'
    graph += f';[layout]subtitles={caption_file}:fontsdir=fonts,format=yuv420p[outv]' if caption_file else ';[layout]format=yuv420p[outv]'
    return graph, out_w, out_h
