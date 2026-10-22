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
exceptions.HomeAssistantError = RuntimeError
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
    async def test_stale_dashboard_quits_before_recasting(self):
        self.controller.config["power_entity"]="media_player.screen"
        self.states["media_player.screen"]=SimpleNamespace(state="on",attributes={})
        self.states['media_player.cast'].state='playing'
        self.states['media_player.cast'].attributes={'app_name':'Home Assistant Lovelace'}
        original=self.hass.services.async_call
        async def call(domain,service,*args,**kwargs):
            await original(domain,service,*args,**kwargs)
            if (domain,service)==('media_player','turn_off'):
                self.states['media_player.cast'].state='off'
                self.states['media_player.cast'].attributes={}
        self.hass.services.async_call=call
        await self.controller.cast()
        self.assertEqual([c[0][:2] for c in self.hass.services.calls],[('media_player','turn_off'),('cast','show_lovelace_view')])
    async def test_app_opening_during_receiver_reset_prevents_recast(self):
        self.controller.config["power_entity"]="media_player.screen"
        self.states["media_player.screen"]=SimpleNamespace(state="on",attributes={})
        self.states['media_player.cast'].state='playing'
        self.states['media_player.cast'].attributes={'app_name':'Home Assistant Lovelace'}
        original=self.hass.services.async_call
        async def call(domain,service,*args,**kwargs):
            await original(domain,service,*args,**kwargs)
            self.states['media_player.cast'].state='off'
            self.states['media_player.cast'].attributes={}
            self.states['remote.tv'].attributes={'current_activity':'netflix'}
        self.hass.services.async_call=call
        await self.controller.cast()
        self.assertEqual([c[0][:2] for c in self.hass.services.calls],[('media_player','turn_off')])
    async def test_receiver_reset_timeout_records_error_and_unsubscribes(self):
        self.controller.config["power_entity"]="media_player.screen"
        self.states["media_player.screen"]=SimpleNamespace(state="on",attributes={})
        self.states['media_player.cast'].state='playing'
        self.states['media_player.cast'].attributes={'app_name':'Home Assistant Lovelace'}
        unsubscribed=[]
        async def timeout(awaitable, timeout):
            self.assertEqual(timeout,10)
            awaitable.close()
            raise TimeoutError()
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}), patch.object(controller_module,'async_track_state_change_event',return_value=lambda: unsubscribed.append(True)), patch.object(controller_module.asyncio,'wait_for',side_effect=timeout):
            await self.controller.cast()
        self.assertEqual(unsubscribed,[True])
        self.assertEqual(self.controller.last_error,'The stale Home Assistant Cast receiver did not close')
        self.assertEqual([c[0][:2] for c in self.hass.services.calls],[('media_player','turn_off')])
        self.assertGreater(self.hass.timers[-1].delay,298)
    async def test_user_context_is_preserved(self):
        context=object()
        await self.controller.cast(context)
        self.assertIs(self.hass.services.calls[0][1]['context'],context)

    async def start_unconfirmed_receiver(self):
        self.controller.config['power_entity']='media_player.screen'
        self.states['media_player.screen']=SimpleNamespace(state='on',attributes={})
        original=self.hass.services.async_call
        async def call(*args,**kwargs):
            await original(*args,**kwargs)
            self.states['media_player.cast']=SimpleNamespace(state='playing',attributes={'app_name':'Home Assistant Lovelace'})
            self.states['remote.tv'].attributes={'current_activity':'com.google.android.apps.mediashell'}
        self.hass.services.async_call=call
        await self.controller.cast()

    async def test_missing_title_retries_existing_receiver_once_then_stops(self):
        await self.start_unconfirmed_receiver()
        self.assertGreater(self.hass.timers[-1].delay,44)
        self.hass.timers[-1].callback(None)
        await self.controller.task
        self.assertEqual(len(self.hass.services.calls),2)
        self.assertEqual([c[0][:2] for c in self.hass.services.calls],[('cast','show_lovelace_view')]*2)
        self.controller.last_attempt-=46
        self.hass.timers[-1].callback(None)
        self.assertFalse(self.controller.awaiting_dashboard)
        self.assertIn('no dashboard title',self.controller.last_error)
        self.controller.evaluate()
        self.assertEqual(len(self.hass.services.calls),2)

    async def test_title_cancels_connection_retry(self):
        await self.start_unconfirmed_receiver()
        timer=self.hass.timers[-1]
        self.states['media_player.cast'].attributes['media_title']='Home: Overview'
        self.controller.evaluate()
        self.assertTrue(timer.cancelled)
        self.assertFalse(self.controller.awaiting_dashboard)
        self.assertEqual(self.controller.reason,'dashboard reported')
        self.assertEqual(len(self.hass.services.calls),1)

    async def test_user_opens_app_before_retry(self):
        await self.start_unconfirmed_receiver()
        self.states['remote.tv'].attributes={'current_activity':'netflix'}
        self.controller.evaluate()
        await self.controller.retry_connection()
        self.assertFalse(self.controller.awaiting_dashboard)
        self.assertEqual(len(self.hass.services.calls),1)

if __name__=='__main__': unittest.main()
