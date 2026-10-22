"""Controller scheduling tested with lightweight HA boundary fakes, no live TV."""
import asyncio
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).parents[1] / 'custom_components/homeboard_tv'

def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

package = ModuleType('homeboard_test')
package.__path__ = [str(ROOT)]
sys.modules['homeboard_test'] = package
load_module('homeboard_test.policy', 'policy.py')
core, event, exceptions = ModuleType('homeassistant.core'), ModuleType('homeassistant.helpers.event'), ModuleType('homeassistant.exceptions')
core.callback = lambda f: f
exceptions.ServiceValidationError = ValueError
class Timer:
    def __init__(self, delay, callback): self.delay, self.callback, self.cancelled = delay, callback, False
    def cancel(self): self.cancelled = True

def later(hass, delay, callback):
    timer=Timer(delay,callback); hass.timers.append(timer); return timer.cancel

event.async_call_later = later
event.async_track_state_change_event = lambda hass, ids, callback: lambda: None
with patch.dict(sys.modules, {'homeassistant':ModuleType('homeassistant'),'homeassistant.core':core,'homeassistant.helpers':ModuleType('homeassistant.helpers'),'homeassistant.helpers.event':event,'homeassistant.exceptions':exceptions}):
    controller_module=load_module('homeboard_test.controller','controller.py')

class Services:
    def __init__(self): self.calls=[]; self.fail=False
    async def async_call(self,*args,**kwargs):
        self.calls.append((args,kwargs))
        if self.fail: raise RuntimeError('Receiver unavailable')

class ControllerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.states={'media_player.cast':SimpleNamespace(state='idle',attributes={}), 'remote.tv':SimpleNamespace(state='on',attributes={'current_activity':'launcher'})}
        self.hass=SimpleNamespace(states=self.states,services=Services(),timers=[],async_create_task=asyncio.create_task)
        self.entry=SimpleNamespace(title='Test',options={},data={'mode':'cast','playback_entity':'media_player.cast','activity_entity':'remote.tv','idle_apps':'launcher','remote_entity':'remote.tv','idle_seconds':45,'cooldown_seconds':300})
        self.controller=controller_module.Controller(self.hass,self.entry)
    async def asyncTearDown(self): await self.controller.stop()
    async def test_stable_idle_debounce_is_not_reset_by_attributes(self):
        self.controller.evaluate(); timer=self.hass.timers[-1]
        self.controller.evaluate()
        self.assertEqual(len(self.hass.timers),1)
        self.assertEqual(timer.delay,45)
    async def test_starting_media_cancels_timer(self):
        self.controller.evaluate(); timer=self.hass.timers[-1]
        self.states['media_player.cast'].state='playing'
        self.controller.evaluate()
        self.assertTrue(timer.cancelled)
    async def test_dispatch_rechecks_for_races(self):
        self.states['media_player.cast'].state='paused'
        await self.controller.cast()
        self.assertEqual(self.hass.services.calls,[])
    async def test_success_dispatch_has_cooldown(self):
        await self.controller.cast()
        self.assertEqual(self.hass.services.calls[0][0][:2],('cast','show_lovelace_view'))
        self.assertGreater(self.hass.timers[-1].delay,298)
    async def test_failure_retries_after_cooldown(self):
        self.hass.services.fail=True
        await self.controller.cast()
        self.assertEqual(self.controller.last_error,'Receiver unavailable')
        self.assertGreater(self.hass.timers[-1].delay,298)
    async def test_app_launch_cancels_cast_and_starts_grace(self):
        self.controller.evaluate(); timer=self.hass.timers[-1]
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            await self.controller.launch('netflix://')
        self.assertTrue(timer.cancelled)
        self.assertEqual(self.controller.reason,'app grace period')
        self.assertEqual(self.hass.services.calls[0][0][:2],('remote','turn_on'))
    async def test_grace_wakes_without_state_event(self):
        self.controller.suspended_until=controller_module.monotonic()+60
        self.controller.evaluate()
        self.assertGreater(self.hass.timers[-1].delay,59)
        self.controller.suspended_until=0
        self.hass.timers[-1].callback(None)
        self.assertEqual(self.hass.timers[-1].delay,45)
    async def test_reload_cancels_outstanding_timer(self):
        self.controller.evaluate(); timer=self.hass.timers[-1]
        await self.controller.stop()
        self.assertTrue(timer.cancelled)
        self.controller.evaluate()
        self.assertEqual(len(self.hass.timers),1)
    async def test_missing_remote_fails_before_suspension(self):
        self.controller.config.pop('remote_entity')
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            with self.assertRaises(ValueError): await self.controller.launch('netflix://')
        self.assertEqual(self.controller.suspended_until,0)
    async def test_user_context_is_preserved(self):
        context=object()
        await self.controller.cast(context)
        self.assertIs(self.hass.services.calls[0][1]['context'],context)

if __name__=='__main__': unittest.main()
