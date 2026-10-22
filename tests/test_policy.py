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
        for state in ["playing","paused","buffering","off","unknown","unavailable","standby","on"]:
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
        self.assertEqual(reason(self.config,self.states),"dashboard visible")
    def test_switch_and_grace_block(self):
        self.assertEqual(reason(self.config,self.states,enabled=False),"disabled")
        self.assertEqual(reason(self.config,self.states,suspended=True),"app grace period")
    def test_no_guard_is_never_ready(self):
        self.config.pop("activity_entity")
        self.assertEqual(reason(self.config,self.states),"idle detection not configured")

if __name__ == '__main__': unittest.main()
