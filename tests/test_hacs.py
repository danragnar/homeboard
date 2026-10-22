"""Packaging contracts that keep HACS installs self-contained and versioned."""
import importlib.util
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from zipfile import ZipFile

ROOT = Path(__file__).parents[1]

def load(name, file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class HacsTests(unittest.TestCase):
    def test_versions_match(self):
        manifest=json.loads((ROOT/'custom_components/homeboard_tv/manifest.json').read_text())
        package=json.loads((ROOT/'package.json').read_text())
        const=(ROOT/'custom_components/homeboard_tv/const.py').read_text()
        self.assertEqual(manifest['version'],package['version'])
        self.assertIn(f'VERSION = "{manifest["version"]}"',const)
    def test_single_integration_with_all_frontend_imports(self):
        self.assertEqual([p.name for p in (ROOT/'custom_components').iterdir() if p.is_dir() and p.name!='__pycache__'],['homeboard_tv'])
        frontend=ROOT/'custom_components/homeboard_tv/frontend'
        card=(frontend/'homeboard-tv-card.js').read_text()
        for dependency in re.findall(r"from ['\"]\./([^'\"]+)",card):
            self.assertTrue((frontend/dependency).is_file(),dependency)
        self.assertIn('lovelace',json.loads((ROOT/'custom_components/homeboard_tv/manifest.json').read_text())['dependencies'])
    def test_hacs_manifest_is_repository_based(self):
        data=json.loads((ROOT/'hacs.json').read_text())
        self.assertEqual(data['name'],'Homeboard TV')
        self.assertFalse(data.get('zip_release',False))
    def test_release_zip_has_correct_root_and_no_caches(self):
        module=load('homeboard_package','package.py')
        with TemporaryDirectory() as tmp, patch.object(module,'OUTPUT',Path(tmp)/'source.zip'):
            module.package()
            with ZipFile(Path(tmp)/'homeboard_tv.zip') as archive:
                names=archive.namelist()
                self.assertIn('manifest.json',names)
                self.assertIn('frontend/homeboard-tv-card.js',names)
                self.assertIn('frontend/model.mjs',names)
                self.assertIn('frontend/styles.mjs',names)
                self.assertFalse(any('__pycache__' in name or name.endswith('.pyc') or name.startswith('custom_components/') for name in names))
            with ZipFile(Path(tmp)/'source.zip') as archive:
                self.assertTrue(any(name.endswith('/hacs.json') for name in archive.namelist()))
    def test_metadata_preparation_and_release_guard(self):
        module=load('homeboard_prepare','prepare_hacs.py')
        with TemporaryDirectory() as tmp:
            manifest=Path(tmp)/'manifest.json';manifest.write_text('{"version":"0.2.0"}')
            with patch.object(module,'MANIFEST',manifest):
                with self.assertRaises(SystemExit):module.prepare('example-owner/homeboard',check=True)
                module.prepare('example-owner/homeboard')
                module.prepare('example-owner/homeboard',check=True,tag='v0.2.0')
                with self.assertRaises(SystemExit):module.prepare('example-owner/homeboard',check=True,tag='v9.0.0')
                with self.assertRaises(SystemExit):module.prepare('https://github.com/example-owner/homeboard')

if __name__=='__main__':unittest.main()
