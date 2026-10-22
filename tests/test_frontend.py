"""Resource lifecycle tests with HA storage/HTTP boundary fakes."""
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

ROOT=Path(__file__).parents[1]/'custom_components/homeboard_tv'
package=ModuleType('homeboard_frontend_test');package.__path__=[str(ROOT)]
http=ModuleType('homeassistant.components.http')
http.StaticPathConfig=lambda url,path,cache:SimpleNamespace(url_path=url,path=path,cache_headers=cache)
ll=ModuleType('homeassistant.components.lovelace.const');ll.LOVELACE_DATA='lovelace'
with patch.dict(sys.modules,{'homeboard_frontend_test':package,'homeassistant':ModuleType('homeassistant'),'homeassistant.components':ModuleType('homeassistant.components'),'homeassistant.components.http':http,'homeassistant.components.lovelace':ModuleType('homeassistant.components.lovelace'),'homeassistant.components.lovelace.const':ll}):
    spec=importlib.util.spec_from_file_location('homeboard_frontend_test.frontend',ROOT/'frontend.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class Resources:
    def __init__(self,items=()):self.items=list(items);self.loaded=False;self.writes=[]
    async def async_get_info(self):self.loaded=True
    def async_items(self):
        assert self.loaded
        return self.items.copy()
    async def async_create_item(self,data):self.writes.append(('create',data))
    async def async_update_item(self,key,data):self.writes.append(('update',key,data))
    async def async_delete_item(self,key):self.writes.append(('delete',key))

class FrontendTests(unittest.IsolatedAsyncioTestCase):
    def fake_hass(self,resources):
        paths=[]
        async def register(items):paths.extend(items)
        return SimpleNamespace(http=SimpleNamespace(async_register_static_paths=register),data={'lovelace':SimpleNamespace(resources=resources)}),paths
    async def test_first_install_registers_bundled_assets_and_module(self):
        resources=Resources();hass,paths=self.fake_hass(resources)
        await module.async_setup_frontend(hass)
        self.assertEqual(paths[0].url_path,'/homeboard_tv/0.2.0')
        self.assertTrue((Path(paths[0].path)/'model.mjs').is_file())
        self.assertEqual(resources.writes,[('create',{'res_type':'module','url':module.RESOURCE_URL})])
    async def test_existing_current_resource_is_unchanged(self):
        resources=Resources([{'id':'a','url':module.RESOURCE_URL,'type':'module'}]);hass,_=self.fake_hass(resources)
        await module.async_setup_frontend(hass)
        self.assertEqual(resources.writes,[])
    async def test_old_version_and_legacy_duplicate_are_migrated(self):
        resources=Resources([{'id':'a','url':'/homeboard_tv/0.1.0/homeboard-tv-card.js','type':'module'},{'id':'b','url':module.LEGACY_PATH+'?v=old','type':'module'},{'id':'other','url':'/local/another-card.js','type':'module'}]);hass,_=self.fake_hass(resources)
        await module.async_setup_frontend(hass)
        self.assertEqual(resources.writes,[('update','a',{'res_type':'module','url':module.RESOURCE_URL}),('delete','b')])
    async def test_yaml_resources_are_not_modified(self):
        yaml=SimpleNamespace(async_items=lambda:[]);hass,paths=self.fake_hass(yaml)
        with self.assertLogs(module._LOGGER,level='WARNING'):
            await module.async_setup_frontend(hass)
        self.assertEqual(len(paths),1)
    async def test_storage_failure_is_logged_without_disabling_integration(self):
        resources=Resources()
        async def fail():raise RuntimeError('Storage unavailable')
        resources.async_get_info=fail;hass,paths=self.fake_hass(resources)
        with self.assertLogs(module._LOGGER,level='ERROR'):
            await module.async_setup_frontend(hass)
        self.assertEqual(len(paths),1)
    def test_resource_ownership_does_not_match_other_cards(self):
        self.assertTrue(module.managed_resource(module.LEGACY_PATH+'?v=0.1.0'))
        self.assertFalse(module.managed_resource('/local/other.js'))
        self.assertFalse(module.managed_resource('https://other.invalid/homeboard_tv/0.1/homeboard-tv-card.js'))

if __name__=='__main__':unittest.main()
