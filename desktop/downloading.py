from pathlib import Path


def download_video(url: str, folder: Path, ffmpeg: str, node: Path, progress, check) -> Path:
    from yt_dlp import YoutubeDL
    maximum = 8_000_000_000
    def hook(data):
        check()
        if data.get('status') == 'downloading':
            total = data.get('total_bytes') or data.get('total_bytes_estimate') or 0
            done = data.get('downloaded_bytes', 0)
            if done > maximum:
                raise ValueError('O vídeo ultrapassou o limite de 8 GB.')
            progress('Baixando seu vídeo', min(99, int(100*done/total)) if total else 0)
    def allowed(info, *, incomplete=False):
        check()
        if info.get('is_live') or info.get('live_status') in {'is_live', 'is_upcoming'}:
            return 'Use um vídeo gravado, e não uma transmissão ao vivo.'
        if (info.get('duration') or 0) > 4*3600:
            return 'Escolha um vídeo de até quatro horas.'
        return None
    options = {'format': 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/b[height<=1080]', 'outtmpl': str(folder / 'source.%(ext)s'), 'ffmpeg_location': ffmpeg, 'merge_output_format': 'mp4', 'noplaylist': True, 'max_filesize': maximum, 'socket_timeout': 30, 'retries': 3, 'quiet': True, 'no_warnings': True, 'progress_hooks': [hook], 'windowsfilenames': True, 'overwrites': False, 'match_filter': allowed}
    if node.is_file():
        options['js_runtimes'] = {'node': {'path': str(node)}}
    with YoutubeDL(options) as downloader:
        info = downloader.extract_info(url, download=True)
        if not info:
            raise ValueError('Não consegui baixar este vídeo. Escolha um vídeo gravado de até quatro horas.')
        progress('Vídeo preparado', 100, str(info.get('title') or 'Vídeo por link')[:500])
        path = Path(info.get('requested_downloads', [{}])[0].get('filepath') or downloader.prepare_filename(info))
    if not path.is_file():
        candidates = [item for item in folder.glob('source.*') if item.suffix in {'.mp4', '.mkv', '.webm', '.mov'}]
        if not candidates:
            raise ValueError('O download não gerou um vídeo completo. Tente enviar o arquivo.')
        path = candidates[0]
    if not path.resolve().is_relative_to(folder.resolve()):
        raise ValueError('O download retornou um caminho inválido.')
    return path
