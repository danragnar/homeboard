"""Safety regressions independent of a running HA instance."""
import importlib.util
from pathlib import Path
import sys
import unittest

spec = importlib.util.spec_from_file_location("homeboard_policy", Path(__file__).parents[1] / "custom_components/homeboard_tv/policy.py")
policy = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = policy
spec.loader.exec_module(policy)
Snapshot, reason = policy.Snapshot, policy.idle_reason

class IdlePolicyTests(unittest.TestCase):
    def setUp(self):
        self.config = {"playback_entity":"media_player.cast", "activity_entity":"remote.tv", "idle_apps":"launcher, home", "power_entity":"media_player.screen"}
        self.states = {"media_player.cast":Snapshot("idle"), "remote.tv":Snapshot("on", {"current_activity":"launcher"}), "media_player.screen":Snapshot("on")}
    def test_idle_launcher_ready(self):
        self.assertEqual(reason(self.config,self.states),"ready")
    def test_playback_and_pause_block_casting(self):
        for state in ["playing","paused","buffering","unknown","unavailable","standby","on"]:
            self.states["media_player.cast"]=Snapshot(state)
            self.assertNotEqual(reason(self.config,self.states),"ready",state)
    def test_native_app_browsing_blocks_even_when_cast_idle(self):
        for app in ["netflix",None,""]:
            self.states["remote.tv"]=Snapshot("on",{"current_activity":app})
            self.assertNotEqual(reason(self.config,self.states),"ready")
    def test_always_powered_receiver_does_not_wake_screen(self):
        for state in ["off","unavailable","unknown","standby"]:
            self.states["media_player.screen"]=Snapshot(state)
            self.assertEqual(reason(self.config,self.states),"screen off")
    def test_unavailable_guard_or_activity_fail_closed(self):
        self.states.pop("remote.tv")
        self.assertNotEqual(reason(self.config,self.states),"ready")
        self.config.pop("activity_entity")
        self.config["idle_guard"]="binary_sensor.idle"
        for state in ["off","unknown","unavailable"]:
            self.states["binary_sensor.idle"]=Snapshot(state)
            self.assertNotEqual(reason(self.config,self.states),"ready")
    def test_lg_on_requires_independent_idle_guard(self):
        self.config.pop("activity_entity")
        self.config["idle_guard"]="binary_sensor.idle"
        self.states["binary_sensor.idle"]=Snapshot("on")
        self.states["media_player.cast"]=Snapshot("on")
        self.assertEqual(reason(self.config,self.states),"ready")
    def test_dashboard_does_not_recast(self):
        self.states["media_player.cast"]=Snapshot("idle",{"app_name":"Home Assistant Lovelace"})
        self.states["remote.tv"]=Snapshot("on",{"current_activity":"cast_receiver"})
        self.assertEqual(reason(self.config,self.states),"receiver active; dashboard unconfirmed")
    def test_stale_own_dashboard_can_return_from_known_idle_launcher(self):
        for state in ["idle","playing","paused","buffering","on"]:
            self.states["media_player.cast"]=Snapshot(state,{"app_name":"Home Assistant Lovelace"})
            self.assertEqual(reason(self.config,self.states),"ready",state)
    def test_other_cast_media_never_bypasses_playback_guard(self):
        for app in ["Netflix","YouTube",None]:
            for state in ["playing","paused","buffering"]:
                self.states["media_player.cast"]=Snapshot(state,{"app_name":app})
                self.assertEqual(reason(self.config,self.states),"media in use")
    def test_stale_dashboard_still_respects_power_guard_and_grace(self):
        self.states["media_player.cast"]=Snapshot("playing",{"app_name":"Home Assistant Lovelace"})
        self.states["media_player.screen"]=Snapshot("off")
        self.assertEqual(reason(self.config,self.states),"screen off")
        self.states["media_player.screen"]=Snapshot("on")
        self.config["idle_guard"]="binary_sensor.idle"
        self.states["binary_sensor.idle"]=Snapshot("off")
        self.assertEqual(reason(self.config,self.states),"idle guard closed")
        self.assertEqual(reason(self.config,self.states,suspended=True),"app grace period")
    def test_unknown_foreground_does_not_restart_dashboard(self):
        self.states["media_player.cast"]=Snapshot("playing",{"app_name":"Home Assistant Lovelace"})
        for foreground in [None,"netflix"]:
            self.states["remote.tv"]=Snapshot("on",{"current_activity":foreground})
            self.assertEqual(reason(self.config,self.states),"receiver active; dashboard unconfirmed")
    def test_stale_dashboard_needs_real_power_signal_for_reset(self):
        self.states["media_player.cast"]=Snapshot("playing",{"app_name":"Home Assistant Lovelace"})
        self.config.pop("power_entity")
        self.assertEqual(reason(self.config,self.states),"receiver active; dashboard unconfirmed")
    def test_cast_off_can_mean_idle_receiver_with_independent_power(self):
        self.states["media_player.cast"]=Snapshot("off")
        self.assertEqual(reason(self.config,self.states),"ready")
        self.config.pop("power_entity")
        self.assertEqual(reason(self.config,self.states),"TV offline")
    def test_cast_off_needs_both_power_and_idle_foreground(self):
        self.states["media_player.cast"]=Snapshot("off")
        self.states["remote.tv"]=Snapshot("on",{"current_activity":"netflix"})
        self.assertEqual(reason(self.config,self.states),"TV offline")
        self.states["remote.tv"]=Snapshot("on",{"current_activity":"launcher"})
        self.states["media_player.screen"]=Snapshot("off")
        self.assertEqual(reason(self.config,self.states),"screen off")
    def test_off_script_transport_is_not_an_idle_receiver(self):
        self.config["mode"]="script"
        self.states["media_player.cast"]=Snapshot("off")
        self.assertEqual(reason(self.config,self.states),"TV offline")
    def test_switch_and_grace_block(self):
        self.assertEqual(reason(self.config,self.states,enabled=False),"disabled")
        self.assertEqual(reason(self.config,self.states,suspended=True),"app grace period")
    def test_no_guard_is_never_ready(self):
        self.config.pop("activity_entity")
        self.assertEqual(reason(self.config,self.states),"idle detection not configured")
    def test_untitled_receiver_can_retry_only_in_cast_foreground(self):
        self.states['media_player.cast']=Snapshot('playing',{'app_name':'Home Assistant Lovelace'})
        self.states['remote.tv']=Snapshot('on',{'current_activity':'com.google.android.apps.mediashell'})
        self.assertEqual(policy.connection_retry_reason(self.config,self.states),'ready')
        for app in ['netflix','launcher',None]:
            self.states['remote.tv']=Snapshot('on',{'current_activity':app})
            self.assertNotEqual(policy.connection_retry_reason(self.config,self.states),'ready')
    def test_retry_stops_on_title_and_requires_online_independent_signals(self):
        self.states['media_player.cast']=Snapshot('playing',{'app_name':'Home Assistant Lovelace','media_title':'Home: Overview'})
        self.assertEqual(reason(self.config,self.states),'ready')  # launcher means stale session
        self.assertEqual(policy.connection_retry_reason(self.config,self.states),'dashboard reported')
        self.states['media_player.cast']=Snapshot('playing',{'app_name':'Home Assistant Lovelace'})
        self.states['remote.tv']=Snapshot('on',{'current_activity':'com.google.android.apps.mediashell'})
        self.assertNotEqual(policy.connection_retry_reason(self.config,self.states,enabled=False),'ready')
        self.assertNotEqual(policy.connection_retry_reason(self.config,self.states,suspended=True),'ready')
        self.states['media_player.screen']=Snapshot('off')
        self.assertNotEqual(policy.connection_retry_reason(self.config,self.states),'ready')
        self.states['media_player.screen']=Snapshot('on')
        self.config['idle_guard']='binary_sensor.idle'
        self.assertNotEqual(policy.connection_retry_reason(self.config,self.states),'ready')

class BrowserPolicyTests(unittest.TestCase):
    def setUp(self):
        IdlePolicyTests.setUp(self)
        self.config.update(mode="browser",browser_app="com.phlox.tvwebbrowser")

    def test_cast_off_with_powered_screen_and_idle_launcher_is_ready(self):
        self.states['media_player.cast']=Snapshot('off')
        self.assertEqual(reason(self.config,self.states),'ready')
        self.states['media_player.screen']=Snapshot('off')
        self.assertEqual(reason(self.config,self.states),'screen off')

    def test_browser_already_open_never_relaunches_even_if_in_idle_list(self):
        self.config['idle_apps']+=',com.phlox.tvwebbrowser'
        self.states['remote.tv']=Snapshot('on',{'current_activity':'com.phlox.tvwebbrowser'})
        for state in ['off','idle','playing','paused']:
            self.states['media_player.cast']=Snapshot(state)
            self.assertEqual(reason(self.config,self.states),'browser active; page unconfirmed')
        self.states['media_player.screen']=Snapshot('off')
        self.assertEqual(reason(self.config,self.states),'screen off')

    def test_streaming_and_unknown_foreground_are_protected(self):
        for app in [None,'netflix','other.browser']:
            self.states['remote.tv']=Snapshot('on',{'current_activity':app})
            for state in ['off','idle','playing','paused']:
                self.states['media_player.cast']=Snapshot(state)
                self.assertNotEqual(reason(self.config,self.states),'ready')

    def test_stale_own_cast_session_on_launcher_can_be_replaced_by_browser(self):
        self.states['media_player.cast']=Snapshot('playing',{'app_name':'Home Assistant Lovelace'})
        self.assertEqual(reason(self.config,self.states),'ready')
        self.config.pop('power_entity')
        self.assertNotEqual(reason(self.config,self.states),'ready')

    def test_other_media_is_never_interrupted_on_launcher(self):
        for state in ['playing','paused','buffering']:
            self.states['media_player.cast']=Snapshot(state,{'app_name':'YouTube'})
            self.assertEqual(reason(self.config,self.states),'media in use')

    def test_browser_has_no_cast_connection_retries(self):
        self.assertEqual(policy.connection_retry_reason(self.config,self.states),'not Cast transport')

if __name__ == '__main__': unittest.main()
