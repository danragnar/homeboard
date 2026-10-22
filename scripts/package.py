#!/usr/bin/env python3
"""Build a source-and-installation archive without credentials, caches or Git data."""
from pathlib import Path
import json
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'custom_components/homeboard_tv/manifest.json').read_text())['version']
OUTPUT = ROOT / 'artifacts' / f'homeboard-tv-{VERSION}.zip'

def package():
    OUTPUT.parent.mkdir(exist_ok=True)
    paths = [ROOT / name for name in ('README.md', 'CHANGELOG.md', 'package.json', 'hacs.json', '.gitignore')]
    for name in ('custom_components', 'examples', 'preview', 'scripts', 'tests', '.github'):
        paths.extend(path for path in (ROOT/name).rglob('*') if path.is_file() and '__pycache__' not in path.parts and path.suffix != '.pyc')
    with ZipFile(OUTPUT, 'w', ZIP_DEFLATED) as archive:
        for path in sorted(paths): archive.write(path, Path(f'homeboard-tv-{VERSION}')/path.relative_to(ROOT))
    integration_root = ROOT / 'custom_components/homeboard_tv'
    integration_zip = OUTPUT.parent / 'homeboard_tv.zip'
    with ZipFile(integration_zip, 'w', ZIP_DEFLATED) as archive:
        for path in sorted(integration_root.rglob('*')):
            if path.is_file() and '__pycache__' not in path.parts and path.suffix != '.pyc':
                archive.write(path, path.relative_to(integration_root))
    print(OUTPUT)
    print(integration_zip)

if __name__ == '__main__': package()
