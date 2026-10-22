#!/usr/bin/env python3
"""Set real GitHub metadata before publishing; never invent repository ownership."""
import argparse
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'custom_components/homeboard_tv/manifest.json'


def prepare(repository, check=False, tag=None):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+', repository):
        raise SystemExit('Use an owner/repository identifier, not a URL')
    owner, _ = repository.split('/')
    metadata = json.loads(MANIFEST.read_text())
    expected = {'documentation':f'https://github.com/{repository}#readme',
                'issue_tracker':f'https://github.com/{repository}/issues',
                'codeowners':[f'@{owner}']}
    if check:
        mismatches = [key for key, value in expected.items() if metadata.get(key) != value]
        if mismatches:
            raise SystemExit('Run scripts/prepare_hacs.py --repository ' + repository + ' and commit the updated manifest first; mismatched: ' + ', '.join(mismatches))
    else:
        metadata.update(expected)
        MANIFEST.write_text(json.dumps(metadata, indent=2) + '\n')
        print('Prepared GitHub/HACS metadata for ' + repository)
    if tag and tag != 'v' + metadata['version']:
        raise SystemExit(f"Tag {tag} must match manifest version v{metadata['version']}")
    return metadata


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', required=True, help='GitHub owner/repository')
    parser.add_argument('--check', action='store_true', help='Validate without modifying files')
    parser.add_argument('--tag', help='Require a matching release tag, e.g. v0.2.0')
    args = parser.parse_args()
    prepare(args.repository, args.check, args.tag)
