# Build using the isolated environment described in desktop/README.md.
from pathlib import Path
from PyInstaller.utils.hooks import collect_all, collect_data_files

root = Path(SPECPATH)
destination = (Path(DISTPATH) / 'DGCLIPS').resolve()
if root.resolve().is_relative_to(destination) or (destination / '.git').exists() or (destination / 'DGCLIPS-Dados').exists():
    raise RuntimeError('Choose a fresh build output. The destination contains source code or user media.')
datas = [(str(root / 'ui-dist'), 'ui-dist'), (str(root / 'models'), 'models'), (str(root / 'licenses'), 'licenses'), (str(root / 'model-manifest.json'), '.'), (str(root.parent / 'LICENSE'), '.'), (str(root.parent / 'NOTICE.md'), '.')]
binaries = [(str(root / 'tools/ffmpeg.exe'), 'tools'), (str(root / 'tools/node.exe'), 'tools')]
hiddenimports = ['webview.platforms.winforms', 'clr', 'pythonnet', 'clr_loader', 'faster_whisper', 'av']
for package in ['faster_whisper', 'ctranslate2', 'onnxruntime', 'tokenizers', 'yt_dlp_ejs']:
    package_datas, package_binaries, package_imports = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_imports
datas += collect_data_files('webview')
datas += collect_data_files('certifi')

a = Analysis([str(root / 'main.py')], pathex=[str(root)], binaries=binaries, datas=datas, hiddenimports=hiddenimports, hookspath=[], hooksconfig={}, runtime_hooks=[], excludes=['torch', 'tensorflow', 'matplotlib', 'pandas', 'scipy', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'IPython', 'pytest'], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], name='DGCLIPS', exclude_binaries=True, debug=False, strip=False, upx=False, console=False, icon=str(root / 'DGCLIPS.ico'))
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='DGCLIPS')
