"""Word-timed ASS captions. Animated presets share the same timing and safe zones."""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

from clipping import ass_escape, ass_time

PRESETS = json.loads(Path(__file__).with_name('caption-presets.json').read_text(encoding='utf-8'))
PRESET_IDS = {preset['id'] for preset in PRESETS}


def ass_color(color: str, alpha: str = '00') -> str:
    if not re.fullmatch(r'#[0-9A-Fa-f]{6}', color):
        raise ValueError('Escolha uma cor de legenda válida.')
    return f'&H{alpha}{color[5:7]}{color[3:5]}{color[1:3]}&'


def flatten_words(segments: list[dict], start: float, end: float) -> list[dict]:
    result = []
    for segment in segments:
        words = segment.get('words')
        if not words:
            pieces = segment['text'].split()
            step = max(.01, segment['end'] - segment['start']) / max(1, len(pieces))
            words = [{'word': word, 'start': segment['start'] + i * step, 'end': segment['start'] + (i+1)*step} for i, word in enumerate(pieces)]
        for word in words:
            first, last = float(word['start']), float(word['end'])
            if not (math.isfinite(first) and math.isfinite(last)) or last <= start or first >= end or last <= first:
                continue
            text = ass_escape(word['word'])
            if text:
                result.append({'word': text, 'start': max(start, first), 'end': min(end, last)})
    return sorted(result, key=lambda word: word['start'])


def caption_groups(words: list[dict], preset: dict) -> list[list[dict]]:
    groups, current, chars = [], [], 0
    for word in words:
        pause = bool(current and word['start'] - current[-1]['end'] > .45)
        if current and (len(current) >= preset['words'] or chars + len(word['word']) + 1 > preset['chars'] or pause):
            groups.append(current)
            current, chars = [], 0
        current.append(word)
        chars += len(word['word']) + 1
        if re.search(r'[.!?…]["\u201d\u2019]*$', word['word']):
            groups.append(current)
            current, chars = [], 0
    if current:
        groups.append(current)
    return groups


def caption_y(height: int, options: dict) -> int:
    position = options.get('caption_position', 'auto')
    if position in {'upper', 'middle', 'lower'}:
        return round(height * {'upper': .23, 'middle': .52, 'lower': .76}[position])
    layout = options.get('layout', 'fill')
    share = options.get('camera_share', .32)
    if position == 'seam' and layout.startswith('react_'):
        return round(height * (share if layout == 'react_top' else 1-share))
    return round(height * (.59 if layout == 'react_top' else .46 if layout == 'react_bottom' else .73))


def make_captions(segments: list[dict], start: float, end: float, width: int, height: int, options: dict) -> str:
    preset = next((preset for preset in PRESETS if preset['id'] == options.get('caption_template')), PRESETS[0])
    scale = options.get('caption_scale', 1)
    size = max(22, round(height * preset['size'] * scale))
    accent = ass_color(options.get('caption_color') or preset['accent'])
    white = ass_color('#FFFFFF')
    outline = preset['outline'] * width / 1080
    shadow = preset['shadow'] * width / 1080
    background = '&H720B101B' if preset['surface'] == 'box' else '&H90000000'
    border = 3 if preset['surface'] == 'box' else 1
    outline_color = ass_color('#171124') if preset['surface'] != 'neon' else ass_color('#653796')
    base = options.get('caption_color') if preset['motion'] in {'fade', 'word_pop'} else None
    primary, secondary = (accent, white) if preset['motion'] == 'karaoke' else (ass_color(base or ('#FFF5DF' if preset['id'] == 'cinema' else '#FFFFFF')), accent)
    header = f'''[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{preset['font']},{size},{primary},{secondary},{outline_color},{background},{-1 if preset['weight'] else 0},0,0,0,100,100,0,0,{border},{outline:.2f},{shadow:.2f},5,{round(width*.09)},{round(width*.12)},0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
    words = flatten_words(segments, start, end)
    groups = caption_groups(words, preset)
    lines = []
    y, x = caption_y(height, options), round(width * .485)
    for group_index, group in enumerate(groups):
        first = group[0]['start']
        next_first = groups[group_index+1][0]['start'] if group_index+1 < len(groups) else end
        last = min(end, group[-1]['end'] + .15, next_first)
        if last <= first:
            continue
        display = [word['word'].upper() if preset['case'] == 'upper' else word['word'] for word in group]
        max_word = max(len(word) for word in display)
        fit_size = min(size, int(width * .77 / max(1, max_word * .62)))
        tags = f'\\an5\\pos({x},{y})\\fs{fit_size}'
        if preset['surface'] == 'neon':
            tags += '\\blur0.6'

        def line(at, until, text, extra=''):
            if until > at:
                lines.append(f'Dialogue: 0,{ass_time(at-start)},{ass_time(until-start)},Default,,0,0,0,,{{{tags}{extra}}}{text}')

        motion = preset['motion']
        if motion == 'karaoke':
            pieces = []
            for i, word in enumerate(group):
                until = group[i+1]['start'] if i+1 < len(group) else last
                pieces.append('{\\kf' + str(max(1, round((until-word['start'])*100))) + '}' + display[i])
            line(first, last, ' '.join(pieces))
        elif motion in {'highlight', 'pop_highlight'}:
            for active, word in enumerate(group):
                until = min(last, group[active+1]['start'] if active+1 < len(group) else last)
                text = ' '.join(('{\\1c' + accent + '}' + value + '{\\1c' + white + '}') if i == active else value for i, value in enumerate(display))
                pop = '\\fscx96\\fscy96\\t(0,85,\\fscx100\\fscy100)' if motion == 'pop_highlight' and active == 0 else ''
                line(word['start'], until, text, pop)
        elif motion == 'word_pop':
            line(first, last, display[0], '\\fscx82\\fscy82\\t(0,100,\\fscx100\\fscy100)\\fad(35,45)')
        else:
            line(first, last, ' '.join(display), '\\fad(90,90)')
    return header + '\n'.join(lines) + '\n'
