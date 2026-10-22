"""Upgrade the shipped idle allowlist without broadening user customizations."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("homeboard_defaults", Path(__file__).parents[1] / "custom_components/homeboard_tv/const.py")
constants = importlib.util.module_from_spec(spec)
spec.loader.exec_module(constants)

class DefaultsTests(unittest.TestCase):
    def test_previous_defaults_expand_without_mutating_input(self):
        values = {"idle_apps": constants.LEGACY_IDLE_APPS, "name": "Example"}
        migrated = constants.migrate_idle_apps(values)
        self.assertEqual(migrated["idle_apps"], constants.DEFAULTS["idle_apps"])
        self.assertEqual(values["idle_apps"], constants.LEGACY_IDLE_APPS)
        self.assertEqual(migrated["name"], "Example")

    def test_custom_empty_and_absent_lists_are_preserved(self):
        for values in [{}, {"idle_apps": ""}, {"idle_apps": "custom.launcher"}, {"idle_apps": constants.DEFAULTS["idle_apps"]}]:
            self.assertEqual(constants.migrate_idle_apps(values), values)
