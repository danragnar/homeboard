"""Browser config requires independent signals and a credential-free HTTP URL."""
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('browser_validation',Path(__file__).parents[1]/'custom_components/homeboard_tv/browser.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class BrowserConfigTests(unittest.TestCase):
    def setUp(self):
        self.data={'remote_entity':'remote.tv','power_entity':'media_player.screen','activity_entity':'remote.tv','browser_url':'https://ha.example/homeboard-home/overview','browser_app':'com.phlox.tvwebbrowser'}
    def test_valid_configuration(self):
        self.assertEqual(module.browser_errors(self.data),{})
        self.assertEqual(module.browser_errors({**self.data,'browser_launch_method':'androidtv_remote'}),{})
    def test_webos_needs_lg_entity_but_no_android_remote(self):
        data={**self.data,'browser_launch_method':'webostv','webos_entity':'media_player.lg'}
        data.pop('remote_entity')
        self.assertEqual(module.browser_errors(data),{})
        data.pop('webos_entity')
        self.assertEqual(module.browser_errors(data),{'webos_entity':'missing_webos_entity'})
    def test_webos_accepts_guard_instead_of_foreground(self):
        data={**self.data,'browser_launch_method':'webostv','webos_entity':'media_player.lg'}
        for key in ['remote_entity','activity_entity','browser_app']:
            data.pop(key)
        self.assertEqual(module.browser_errors(data),{'base':'missing_guard'})
        data['idle_guard']='binary_sensor.lg_launcher'
        self.assertEqual(module.browser_errors(data),{})
        data['power_entity']=''
        self.assertIn('power_entity',module.browser_errors(data))
    def test_webos_foreground_configuration_requires_browser_source(self):
        self.assertIn('browser_app',module.browser_errors({**self.data,'browser_launch_method':'webostv','webos_entity':'media_player.lg','browser_app':''}))
    def test_unknown_launch_method_is_rejected(self):
        self.assertIn('browser_launch_method',module.browser_errors({**self.data,'browser_launch_method':'unsupported'}))
    def test_remote_activity_and_real_power_are_required(self):
        for key in ['remote_entity','activity_entity','power_entity']:
            data={**self.data,key:''}
            self.assertIn(key,module.browser_errors(data))
    def test_full_http_urls_only_without_credentials(self):
        for url in ['',None,'/homeboard-home/overview','javascript:alert(1)','https://user:password@ha.example/','https://[bad']:
            self.assertIn('browser_url',module.browser_errors({**self.data,'browser_url':url}))
        for url in ['https://ha.example/','http://192.0.2.1:8123/homeboard-home/overview']:
            self.assertNotIn('browser_url',module.browser_errors({**self.data,'browser_url':url}))
    def test_empty_browser_foreground_id_rejected(self):
        self.assertIn('browser_app',module.browser_errors({**self.data,'browser_app':' '}))

if __name__=='__main__':unittest.main()
