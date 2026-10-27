import math
import re

from captions import PRESET_IDS
from editorial import FOCUS, LENGTHS, requested_count
from reframing import LAYOUTS, rect

DEFAULTS = {'clip_count': 10, 'clip_length': 'auto', 'editorial_focus': 'balanced', 'editorial_brief': '', 'layout': 'fill', 'caption_template': 'tiktok', 'add_subtitles': True, 'caption_position': 'auto', 'caption_scale': 1, 'caption_color': None, 'camera_share': .32, 'resolution': '1080'}


def validate_options(options: dict, *, require_camera=False) -> dict:
    if not isinstance(options, dict):
        raise ValueError('Opções de corte inválidas.')
    result = {**DEFAULTS, **options}
    if 'layout' not in options and options.get('output_format'):
        result['layout'] = {'vertical': 'fill', 'vertical_fit': 'fit', 'original': 'original'}.get(options['output_format'], 'invalid')
    requested_count(result['clip_count'], 600)
    for field, allowed in [('clip_length', LENGTHS), ('editorial_focus', FOCUS), ('layout', LAYOUTS), ('caption_template', PRESET_IDS), ('caption_position', {'auto', 'upper', 'middle', 'lower', 'seam'}), ('resolution', {'720', '1080'})]:
        if not isinstance(result[field], str) or result[field] not in allowed:
            raise ValueError(f'Escolha uma opção válida para {field}.')
    for field, low, high in [('caption_scale', .7, 1.3), ('camera_share', .2, .5)]:
        value = result[field]
        if type(value) not in (float, int) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError('Escolha um tamanho de legenda ou proporção de câmera válido.')
    if result['caption_color'] is not None and (not isinstance(result['caption_color'], str) or not re.fullmatch(r'#[0-9A-Fa-f]{6}', result['caption_color'])):
        raise ValueError('Escolha uma cor válida para a legenda.')
    if not isinstance(result['editorial_brief'], str) or len(result['editorial_brief']) > 1000:
        raise ValueError('Descreva sua preferência em até 1.000 caracteres.')
    if type(result['add_subtitles']) is not bool:
        raise ValueError('Ative ou desative as legendas.')
    for field in ('camera_rect', 'content_rect'):
        if result.get(field) is not None:
            result[field] = rect(result[field])
    if require_camera and result['layout'].startswith('react_') and not result.get('camera_rect'):
        raise ValueError('Prepare a prévia e selecione a câmera do react antes de gerar os clipes.')
    return result
