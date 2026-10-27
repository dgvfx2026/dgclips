"""DGCLIPS Windows application. Frozen build needs no Python/Node installation."""
from __future__ import annotations

import argparse
import ctypes
import json
import logging
import os
import shutil
import sys
import threading
from pathlib import Path

from engine import Engine
from server import DesktopServer


def resources() -> Path:
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))


def main():
    parser = argparse.ArgumentParser(description="DGCLIPS Studio")
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument("--resources", type=Path)
    parser.add_argument("--serve", action="store_true", help="Local development only")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--self-check", type=Path, help="Write an offline packaging diagnostic")
    parser.add_argument("--test-video", type=Path, help="Process a local fixture during a packaging diagnostic")
    args = parser.parse_args()
    asset_root = args.resources or resources()
    if args.self_check:
        import av
        import ctranslate2
        import faster_whisper
        import yt_dlp
        import yt_dlp_ejs
        import webview
        from faster_whisper import WhisperModel
        model = WhisperModel(str(asset_root / "models/whisper-small"), device="cpu", compute_type="int8", local_files_only=True)
        report = {"ok": True, "model_loaded": bool(model), "av": av.__version__, "ctranslate2": ctranslate2.__version__, "webview_imported": bool(webview), "youtube_solver": bool(yt_dlp_ejs)}
        if args.test_video:
            import time
            test_engine = Engine(args.self_check.resolve().parent / "frozen-media-test", asset_root)
            test_engine.model = model
            source = test_engine.uploads / "fixture.mp4"
            shutil.copy2(args.test_video, source)
            job_id = test_engine.create({"source": {"url": "local-upload:fixture.mp4", "title": "Teste do executável"}, "output_format": "vertical_fit", "clip_length": "short", "add_subtitles": True})
            deadline = time.monotonic() + 180
            while test_engine.get(job_id)["status"] in {"queued", "processing"} and time.monotonic() < deadline:
                time.sleep(0.5)
            result = test_engine.get(job_id)
            test_engine.close()
            report["video_test"] = {"status": result["status"], "clips": len(result["clips"]), "error": result["error"]}
            if result["status"] != "completed":
                raise RuntimeError("Frozen media test failed: " + str(result["error"]))
        args.self_check.write_text(json.dumps(report, indent=2), encoding="utf-8")
        return
    executable_dir = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
    data = (args.data_dir or executable_dir / "DGCLIPS-Dados").resolve()
    try:
        data.mkdir(parents=True, exist_ok=True)
        (data / ".write-check").write_text("ok")
        (data / ".write-check").unlink()
    except OSError:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        chosen = filedialog.askdirectory(title="Escolha onde o DGCLIPS guardará seus vídeos e projetos")
        root.destroy()
        if not chosen:
            return
        data = Path(chosen) / "DGCLIPS-Dados"
        data.mkdir(parents=True, exist_ok=True)
    # WebView2 cache and application logs live beside the user's projects.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    instance_lock = None
    if os.name == "nt":
        import msvcrt
        instance_lock = (data / ".instance-lock").open("a+b")
        instance_lock.write(b"0")
        instance_lock.flush()
        instance_lock.seek(0)
        try:
            msvcrt.locking(instance_lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            ctypes.windll.user32.MessageBoxW(None, "O DGCLIPS já está aberto. Use a janela existente.", "DGCLIPS Studio", 0x40)
            instance_lock.close()
            return
    logging.basicConfig(filename=data / "DGCLIPS.log", level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s", encoding="utf-8")
    engine = Engine(data, asset_root)
    try:
        server = DesktopServer(engine, asset_root / "ui-dist", args.port if args.serve else (args.port or 43117))
    except OSError:
        # Preserve browser preferences on the usual port, with a safe local fallback.
        server = DesktopServer(engine, asset_root / "ui-dist", 0)
    if args.serve:
        # Only the human/developer launching the process receives this URL.
        print(server.start_url, flush=True)
        try:
            server.serve_forever()
        finally:
            engine.close()
        return
    import webview

    class Bridge:
        def _require_local(self):
            if not (window.get_current_url() or "").startswith(server.origin + "/"):
                raise ValueError("Este comando só está disponível dentro do DGCLIPS.")

        def open_projects(self):
            self._require_local()
            os.startfile(str(engine.jobs_dir))
            return True

        def save_clip(self, project_id: str, clip_id: str):
            self._require_local()
            job = engine.get(project_id)
            clip = next((clip for clip in job["clips"] if clip["id"] == clip_id), None)
            if not clip:
                raise ValueError("Clipe não encontrado.")
            target = window.create_file_dialog(webview.FileDialog.SAVE, save_filename=f"DGCLIPS-{clip_id}.mp4", file_types=("Vídeo MP4 (*.mp4)",))
            if not target:
                return False
            destination = Path(target if isinstance(target, str) else target[0])
            if destination.suffix.lower() != ".mp4":
                destination = destination.with_suffix(".mp4")
            shutil.copy2(engine.jobs_dir / project_id / clip["filename"], destination)
            return True

    threading.Thread(target=server.serve_forever, name="DGCLIPS-interface", daemon=True).start()
    window = webview.create_window("DGCLIPS Studio", server.start_url, js_api=Bridge(), width=1380, height=900, min_size=(940, 680), background_color="#030812", confirm_close=True, text_select=True)
    localization = {"global.quitConfirmation": "Fechar o DGCLIPS? Os vídeos em processamento serão interrompidos.", "global.ok": "Confirmar", "global.cancel": "Cancelar", "global.saveFile": "Salvar clipe", "global.save": "Salvar"}
    try:
        webview.start(gui="edgechromium", storage_path=str(data / "Interface"), private_mode=False, debug=False, localization=localization)
    finally:
        engine.close()
        server.shutdown()


if __name__ == "__main__":
    try:
        main()
    except Exception as cause:
        logging.exception("DGCLIPS startup failed")
        if "--self-check" in sys.argv:
            report_path = Path(sys.argv[sys.argv.index("--self-check") + 1])
            report_path.write_text(json.dumps({"ok": False, "error": str(cause)}, indent=2), encoding="utf-8")
            sys.exit(1)
        if os.name == "nt":
            ctypes.windll.user32.MessageBoxW(None, "Não foi possível abrir o DGCLIPS.\n\n" + str(cause)[:700] + "\n\nUse o executável completo. O Windows precisa do Microsoft Edge WebView2.", "DGCLIPS Studio", 0x10)
        else:
            raise
