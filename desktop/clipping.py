"""Local, deterministic suggestions from timestamped speech; no hosted AI calls."""
from __future__ import annotations

import math
import re
from collections import Counter

STOP = set("a o as os de do da dos das e é em um uma uns umas para por com que se na no nas nos ao aos eu você ele ela isso isto the a an and or of to is it in on for you i we that this with was are have".split())
HOOKS = re.compile(r"\b(porque|segredo|erro|nunca|sempre|imagine|aprendi|descobri|diferença|importante|verdade|why|secret|mistake|never|always|imagine|learned|discovered|important|truth)\b", re.I)


def tokens(text: str) -> list[str]:
    return [word for word in re.findall(r"[^\W\d_]+", text.lower()) if len(word) > 2 and word not in STOP]


def suggest_clips(segments: list[dict], duration: float, length: str = "auto", limit: int = 3) -> list[dict]:
    """Prefer speech-dense, self-contained, distinct passages near sentence boundaries."""
    if not segments:
        raise ValueError("Não encontrei fala neste vídeo. Escolha um vídeo com voz audível.")
    low, target, high = {"short": (15, 24, 30), "medium": (30, 45, 60), "long": (60, 75, 90)}.get(length, (20, 42, 60))
    high = min(high, duration)
    low = min(low, max(1, duration - 0.5))
    frequencies = Counter(word for s in segments for word in set(tokens(s["text"])))
    candidates = []
    # Bound the ranking work for multi-hour videos without losing timeline coverage.
    stride = max(1, len(segments) // 2500)
    for index in range(0, len(segments), stride):
        segment = segments[index]
        start = max(0, segment["start"] - 0.12)
        parts = []
        speech = 0.0
        choices = []
        for end_index in range(index, len(segments)):
            item = segments[end_index]
            if item["end"] - start > high + 0.15:
                break
            parts.append(item["text"].strip())
            speech += max(0, item["end"] - item["start"])
            span = item["end"] - start
            if span < low:
                continue
            text = " ".join(parts)
            words = tokens(text)
            if not words:
                continue
            salience = sum(math.log1p(frequencies[word]) for word in set(words)) / math.sqrt(len(words))
            sentence_end = bool(re.search(r"[.!?…][\"']?$", text))
            clean_start = index == 0 or bool(re.search(r"[.!?…][\"']?$", segments[index - 1]["text"].strip()))
            density = min(1, speech / max(1, span))
            score = salience + density * 3 + sentence_end * 1.5 + clean_start + min(2, len(HOOKS.findall(text)) * 0.5) - abs(span - target) / max(1, target)
            choices.append({"start": round(start, 3), "end": round(min(duration, item["end"] + 0.12), 3), "text": text, "rank": score})
        if choices:
            candidates.append(max(choices, key=lambda c: c["rank"]))
    if not candidates:
        start = max(0, segments[0]["start"] - 0.12)
        end = min(duration, segments[-1]["end"] + 0.12, start + high)
        return [{"start": start, "end": end, "text": " ".join(s["text"].strip() for s in segments if s["start"] < end)}]
    selected = []
    for item in sorted(candidates, key=lambda c: c["rank"], reverse=True):
        if all(min(item["end"], previous["end"]) - max(item["start"], previous["start"]) <= 0 for previous in selected):
            selected.append(item)
            if len(selected) >= limit:
                break
    return sorted(selected, key=lambda c: c["start"])


def ass_time(value: float) -> str:
    centis = max(0, round(value * 100))
    hours, rem = divmod(centis, 360000)
    minutes, rem = divmod(rem, 6000)
    seconds, centis = divmod(rem, 100)
    return f"{hours}:{minutes:02}:{seconds:02}.{centis:02}"


def ass_escape(text: str) -> str:
    # ASR output is untrusted; prevent subtitle formatting/control injection.
    return text.replace("\\", " ").replace("{", "(").replace("}", ")").replace("\n", " ").strip()


def make_ass(segments: list[dict], start: float, end: float, width: int, height: int, template: str) -> str:
    font_size = max(20, round(height * 0.043))
    color = "&H0000E9FF" if template == "hormozi" else "&H00FFFFFF"
    outline = max(2, round(height / 270))
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,{font_size},{color},&H0000E9FF,&H00201009,&H80000000,-1,0,0,0,100,100,0,0,1,{outline},1,2,{int(width*.08)},{int(width*.08)},{int(height*.12)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    for segment in segments:
        words = segment.get("words") or [{"start": segment["start"], "end": segment["end"], "word": segment["text"]}]
        group_size = 3 if template == "tiktok" else 5
        for index in range(0, len(words), group_size):
            group = words[index:index + group_size]
            first, last = max(start, group[0]["start"]), min(end, group[-1]["end"])
            if last <= first:
                continue
            text = ass_escape(" ".join(word["word"].strip() for word in group))
            if template == "hormozi":
                text = text.upper()
            lines.append(f"Dialogue: 0,{ass_time(first-start)},{ass_time(last-start)},Default,,0,0,0,,{text}")
    return header + "\n".join(lines) + "\n"
