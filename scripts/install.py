#!/usr/bin/env python3
"""Copy Homeboard into an HA config directory; back up every replaced file first."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]

def install(destination, dry_run=False):
    target = Path(destination).expanduser().resolve()
    if not (target / 'configuration.yaml').is_file():
        raise SystemExit(f'{target} does not contain configuration.yaml; select your HA config directory')
    backup = target / 'homeboard-backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
    for folder in ('custom_components/homeboard_tv',):
        for source in sorted((ROOT / folder).rglob('*')):
            if not source.is_file() or '__pycache__' in source.parts or source.suffix == '.pyc':
                continue
            relative = source.relative_to(ROOT)
            output = target / relative
            print(f'{"Would install" if dry_run else "Install"} {relative}')
            if dry_run:
                continue
            if output.exists():
                saved = backup / relative
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(output, saved)
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, output)
    if not dry_run:
        print(f'Existing files, if any, backed up under {backup}')
        print('Restart Home Assistant. Add Homeboard TV in Devices & services. See README.md for the card resource and dashboard setup.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config_directory', help='Home Assistant configuration directory')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    install(args.config_directory, args.dry_run)
