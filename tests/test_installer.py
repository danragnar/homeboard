"""Updates preserve user configuration and keep backups of replaced files."""
import contextlib
import importlib.util
import io
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

spec = importlib.util.spec_from_file_location('homeboard_installer', Path(__file__).parents[1] / 'scripts/install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class InstallerTests(unittest.TestCase):
    def test_requires_existing_home_assistant_directory(self):
        with TemporaryDirectory() as tmp:
            with self.assertRaises(SystemExit): installer.install(tmp)
            self.assertEqual(list(Path(tmp).iterdir()), [])
    def test_dry_run_creates_no_runtime_files(self):
        with TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            config=Path(tmp)/'configuration.yaml'; config.write_text('default_config:\n')
            installer.install(tmp,dry_run=True)
            self.assertEqual(list(Path(tmp).iterdir()),[config])
    def test_update_preserves_config_and_backs_up_replaced_code(self):
        with TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            target=Path(tmp); config=target/'configuration.yaml'; config.write_text('lovelace: keep-my-settings\n')
            installer.install(tmp)
            module=target/'custom_components/homeboard_tv/frontend/model.mjs'; module.write_text('// previous version\n')
            installer.install(tmp)
            backups=list((target/'homeboard-backups').glob('*/custom_components/homeboard_tv/frontend/model.mjs'))
            self.assertEqual(len(backups),1)
            self.assertEqual(backups[0].read_text(),'// previous version\n')
            self.assertEqual(config.read_text(),'lovelace: keep-my-settings\n')
            self.assertIn('priceIntervals',module.read_text())
            self.assertFalse(list(target.rglob('*.pyc')))

if __name__=='__main__': unittest.main()
