"""Shortcut contracts: platform routing and app-specific payload preservation."""
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('launch_validation',Path(__file__).parents[1]/'custom_components/homeboard_tv/launch.py')
launch=importlib.util.module_from_spec(spec);spec.loader.exec_module(launch)

class LaunchTests(unittest.TestCase):
    def setUp(self):
        self.android={'remote_entity':'remote.tv'}
        self.webos={'app_launch_method':'webostv','webos_entity':'media_player.lg'}

    def test_legacy_android_and_explicit_activity_match(self):
        expected=('remote','turn_on',{'entity_id':'remote.tv','activity':'netflix://'})
        self.assertEqual(launch.launch_call(self.android,'netflix://'),expected)
        self.assertEqual(launch.launch_call(self.android,target={'type':'activity','activity':'netflix://'}),expected)

    def test_native_app_and_content_parameters_pass_through_exactly(self):
        target={'type':'app','app_id':'verified.app','content_id':'service-specific-id',
                'params':{'contentTarget':'episode:42','nested':{'autoplay':True}}}
        self.assertEqual(launch.launch_call(self.webos,target=target),('webostv','command',{
            'entity_id':'media_player.lg','command':'system.launcher/launch',
            'payload':{'id':'verified.app','contentId':'service-specific-id','params':target['params']}}))
        self.assertEqual(target['content_id'],'service-specific-id')
        self.assertEqual(launch.launch_call(self.webos,target={'type':'app','app_id':'verified.app'})[2]['payload'],{'id':'verified.app'})

    def test_browser_url_uses_selected_control_method(self):
        url='https://media.example/video/42'
        self.assertEqual(launch.launch_call(self.android,target={'type':'url','url':url}),('remote','turn_on',{'entity_id':'remote.tv','activity':url}))
        expected=('webostv','command',{'entity_id':'media_player.lg','command':'system.launcher/open','payload':{'target':url}})
        self.assertEqual(launch.launch_call(self.webos,target={'type':'url','url':url}),expected)
        self.assertEqual(launch.launch_call(self.webos,url),expected)

    def test_webos_app_source_uses_select_source(self):
        target={'type':'source','source':'Netflix'}
        self.assertEqual(launch.launch_call(self.webos,target=target),('media_player','select_source',{'entity_id':'media_player.lg','source':'Netflix'}))
        for config in [self.android,{'app_launch_method':'webostv'}]:
            with self.assertRaises(ValueError):launch.launch_call(config,target=target)
        for value in ['',None,' Netflix ']:
            with self.assertRaises(ValueError):launch.launch_call(self.webos,target={'type':'source','source':value})

    def test_script_fallback_works_for_both_platforms_without_tv_control(self):
        target={'type':'script','entity_id':'script.play_episode','variables':{'episode':42}}
        for config in [{},{'app_launch_method':'webostv'}]:
            self.assertEqual(launch.launch_call(config,target=target),('script','turn_on',{'entity_id':'script.play_episode','variables':{'episode':42}}))

    def test_invalid_and_ambiguous_targets_are_rejected(self):
        bad=[None,{},[],{'type':[]},{'type':'unknown'}, {'type':'app','app_id':''},
             {'type':'app','app_id':'test','content_id':''}, {'type':'app','app_id':'test','params':[]},
             {'type':'app','app_id':'test','params':{'n':float('nan')}},
             {'type':'script','entity_id':'scene.movie'}, {'type':'script','entity_id':'script.movie','variables':[]},
             {'type':'url','url':'javascript:alert(1)'}, {'type':'url','url':'/relative'},
             {'type':'url','url':'https://user:pass@example.test'}, {'type':'url','url':'https://[bad'},
             {'type':'url','url':'https://bad host.test'}, {'type':'url','url':'https://example.test\\path'},
             {'type':'app','app_id':'test','typo':True}]
        for target in bad:
            with self.subTest(target=target),self.assertRaises(ValueError):
                launch.launch_call(self.webos,target=target)
        with self.assertRaises(ValueError):launch.launch_call(self.android,'netflix://',{'type':'url','url':'https://example.test'})

    def test_platform_mismatches_and_missing_controls_fail(self):
        for config,target in [(self.android,{'type':'app','app_id':'netflix'}),
                              (self.webos,{'type':'activity','activity':'netflix://'}),
                              ({},{'type':'activity','activity':'netflix://'}),
                              ({'app_launch_method':'webostv'},{'type':'app','app_id':'netflix'})]:
            with self.subTest(config=config,target=target),self.assertRaises(ValueError):launch.launch_call(config,target=target)
        with self.assertRaises(ValueError):launch.launch_call(self.webos,'netflix://')

    def test_webos_configuration_requires_lg_entity(self):
        self.assertEqual(launch.config_errors({}),{})
        self.assertEqual(launch.config_errors(self.webos),{})
        self.assertEqual(launch.config_errors({'app_launch_method':'webostv'}),{'webos_entity':'missing_webos_entity'})
        self.assertIn('app_launch_method',launch.config_errors({'app_launch_method':'wrong'}))
        self.assertIn('home_app',launch.config_errors({**self.webos,'home_app':' '}))

if __name__=='__main__':unittest.main()
