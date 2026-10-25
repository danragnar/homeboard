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

    async def test_return_home_sends_home_and_cancels_pending_cast_and_retry(self):
        self.controller.evaluate()
        timer=self.hass.timers[-1]
        self.controller.awaiting_dashboard=True
        context=object()
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            await self.controller.return_home(context)
        self.assertTrue(timer.cancelled)
        self.assertFalse(self.controller.awaiting_dashboard)
        self.assertEqual(self.controller.reason,'dashboard exit pause')
        self.assertGreater(self.hass.timers[-1].delay,598)
        self.assertEqual(self.hass.services.calls[0][0],('remote','send_command',{'entity_id':'remote.tv','command':'HOME'}))
        self.assertIs(self.hass.services.calls[0][1]['context'],context)
        self.assertTrue(self.controller.enabled)
        await self.controller.cast()
        self.assertEqual(len(self.hass.services.calls),1)

    async def test_return_home_checks_remote_before_pausing_or_sending(self):
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            for value in [None,'off','unavailable']:
                self.states['remote.tv']=SimpleNamespace(state=value,attributes={}) if value else None
                with self.assertRaises(ValueError):
                    await self.controller.return_home()
            self.controller.config.pop('remote_entity')
            with self.assertRaises(ValueError):
                await self.controller.return_home()
        self.assertEqual(self.controller.home_until,0)
        self.assertEqual(self.hass.services.calls,[])

    async def test_return_home_failure_reports_error_and_keeps_bounded_exit_pause(self):
        self.hass.services.fail=True
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            with self.assertRaises(RuntimeError):
                await self.controller.return_home()
        self.assertEqual(self.controller.last_error,'Receiver unavailable')
        self.assertEqual(self.controller.reason,'dashboard exit pause')
        self.assertGreater(self.hass.timers[-1].delay,598)

    async def test_return_home_serializes_after_inflight_dashboard_dispatch(self):
        await self.controller.dispatch_lock.acquire()
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            task=asyncio.create_task(self.controller.return_home())
            await asyncio.sleep(0)
            self.assertEqual(self.hass.services.calls,[])
            self.assertEqual(self.controller.reason,'dashboard exit pause')
            self.controller.dispatch_lock.release()
            await task
        self.assertEqual([call[0][:2] for call in self.hass.services.calls],[('remote','send_command')])

    async def test_return_home_expiry_starts_a_fresh_stable_idle_delay(self):
        self.controller.config['app_grace_seconds']=75
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}), patch.object(controller_module,'monotonic',return_value=1000):
            await self.controller.return_home()
            self.assertEqual(self.hass.timers[-1].delay,75)
        with patch.object(controller_module,'monotonic',return_value=1075):
            self.hass.timers[-1].callback(None)
            self.assertEqual(self.controller.reason,'ready')
            self.assertEqual(self.hass.timers[-1].delay,45)
            self.assertEqual(len(self.hass.services.calls),1)

class BrowserControllerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        ControllerTests.setUp(self)
        self.controller.config.update(mode='browser',browser_url='https://ha.example/homeboard-home/overview',browser_app='com.phlox.tvwebbrowser',power_entity='media_player.screen')
        self.states['media_player.screen']=SimpleNamespace(state='on',attributes={})

    async def asyncTearDown(self):
        await self.controller.stop()

    async def test_explicit_home_pause_survives_browser_to_launcher_and_other_apps(self):
        self.states['remote.tv'].attributes={'current_activity':'com.phlox.tvwebbrowser'}
        self.controller.evaluate()
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            await self.controller.return_home()
        until=self.controller.home_until
        for foreground in ['launcher','netflix','launcher']:
            self.states['remote.tv'].attributes={'current_activity':foreground}
            self.controller.evaluate()
            self.assertEqual(self.controller.home_until,until)
            self.assertEqual(self.controller.reason,'dashboard exit pause')
            self.assertGreater(self.hass.timers[-1].delay,598)
        await self.controller.cast()
        self.assertEqual(len(self.hass.services.calls),1)

    async def test_browser_launch_uses_remote_url_and_no_cast_retry(self):
        self.states['media_player.cast'].state='off'
        original=self.hass.services.async_call
        async def call(*args,**kwargs):
            await original(*args,**kwargs)
            self.states['remote.tv'].attributes={'current_activity':'com.phlox.tvwebbrowser'}
        self.hass.services.async_call=call
        context=object()
        await self.controller.cast(context)
        self.assertEqual(self.hass.services.calls[0][0],('remote','turn_on',{'entity_id':'remote.tv','activity':'https://ha.example/homeboard-home/overview'}))
        self.assertIs(self.hass.services.calls[0][1]['context'],context)
        self.assertFalse(self.controller.awaiting_dashboard)
        self.assertEqual(self.controller.suspended_until,0)
        self.assertIsNone(self.controller.pending)
        self.controller.evaluate()
        self.assertEqual(len(self.hass.services.calls),1)

    async def test_browser_launch_rechecks_after_waiting_for_dispatch_lock(self):
        await self.controller.dispatch_lock.acquire()
        task=asyncio.create_task(self.controller.cast())
        await asyncio.sleep(0)
        self.states['remote.tv'].attributes={'current_activity':'netflix'}
        self.controller.dispatch_lock.release()
        await task
        self.assertEqual(self.hass.services.calls,[])

    async def test_browser_automatic_delay_cancels_on_tv_off_and_rearms_on_home(self):
        self.states['media_player.cast'].state='off'
        self.controller.evaluate()
        timer=self.hass.timers[-1]
        self.assertEqual(timer.delay,45)
        self.states['media_player.screen'].state='off'
        self.controller.evaluate()
        self.assertTrue(timer.cancelled)
        self.assertIsNone(self.controller.pending)
        self.states['media_player.screen'].state='on'
        self.controller.evaluate()
        self.hass.timers[-1].callback(None)
        await self.controller.task
        self.assertEqual(len(self.hass.services.calls),1)
        self.assertGreater(self.hass.timers[-1].delay,298)
        self.states['remote.tv'].attributes={'current_activity':'com.phlox.tvwebbrowser'}
        self.controller.evaluate()
        self.assertIsNone(self.controller.pending)

    async def test_app_then_home_ends_grace_and_cooldown_and_waits_stable_idle(self):
        self.states['remote.tv'].attributes={'current_activity':'com.phlox.tvwebbrowser'}
        self.controller.evaluate()
        self.controller.last_attempt=controller_module.monotonic()
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            await self.controller.launch('tv4://')
        self.assertEqual(self.controller.reason,'app grace period')
        self.states['remote.tv'].attributes={'current_activity':'tv4'}
        self.controller.evaluate()
        self.assertGreater(self.controller.suspended_until,controller_module.monotonic())
        self.states['remote.tv'].attributes={'current_activity':'launcher'}
        self.controller.evaluate()
        self.assertEqual(self.controller.reason,'ready')
        self.assertEqual(self.controller.suspended_until,0)
        self.assertEqual(self.hass.timers[-1].delay,45)
        timer=self.hass.timers[-1]
        self.controller.evaluate()
        self.assertIs(self.hass.timers[-1],timer)
        timer.callback(None)
        await self.controller.task
        self.assertEqual(len(self.hass.services.calls),2)
        self.assertEqual(self.hass.services.calls[-1][0][2]['activity'],self.controller.config['browser_url'])
        self.assertGreater(self.hass.timers[-1].delay,298)

    async def test_return_home_waits_for_playback_to_stop_before_ending_grace(self):
        self.states['remote.tv'].attributes={'current_activity':'tv4'}
        self.controller.evaluate()
        self.controller.suspended_until=controller_module.monotonic()+600
        self.states['media_player.cast'].state='paused'
        self.states['remote.tv'].attributes={'current_activity':'launcher'}
        self.controller.evaluate()
        self.assertEqual(self.controller.reason,'app grace period')
        self.assertTrue(self.controller.returned_to_launcher)
        await self.controller.cast()
        self.assertEqual(self.hass.services.calls,[])
        self.states['media_player.cast'].state='off'
        self.controller.evaluate()
        self.assertEqual(self.controller.reason,'ready')
        self.assertEqual(self.hass.timers[-1].delay,45)

    async def test_no_verified_app_exit_keeps_launch_grace(self):
        self.controller.evaluate()
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            await self.controller.launch('tv4://')
        self.controller.evaluate()
        self.assertEqual(self.controller.reason,'app grace period')
        self.assertGreater(self.hass.timers[-1].delay,598)

    async def test_browser_then_home_starts_new_idle_cycle_without_old_cooldown(self):
        self.controller.last_attempt=controller_module.monotonic()
        self.states['remote.tv'].attributes={'current_activity':'com.phlox.tvwebbrowser'}
        self.controller.evaluate()
        self.states['remote.tv'].attributes={'current_activity':'launcher'}
        self.controller.evaluate()
        self.assertEqual(self.hass.timers[-1].delay,45)

    async def test_screen_off_or_unknown_activity_does_not_waive_cooldown(self):
        for missing in ['power','activity']:
            self.states['remote.tv'].attributes={'current_activity':'tv4'}
            self.controller.evaluate()
            if missing=='power':
                self.states['media_player.screen'].state='off'
            else:
                self.states['remote.tv'].attributes={}
            self.controller.evaluate()
            self.controller.last_attempt=controller_module.monotonic()
            self.states['media_player.screen'].state='on'
            self.states['remote.tv'].attributes={'current_activity':'launcher'}
            self.controller.evaluate()
            self.assertGreater(self.hass.timers[-1].delay,298)

    async def test_browser_launch_failure_records_error_and_obeys_cooldown(self):
        self.hass.services.fail=True
        await self.controller.cast()
        self.assertEqual(self.controller.last_error,'Receiver unavailable')
        self.assertFalse(self.controller.awaiting_dashboard)
        self.assertGreater(self.hass.timers[-1].delay,298)

class WebOSControllerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        ControllerTests.setUp(self)
        self.controller.config.update(mode='browser',browser_launch_method='webostv',
            webos_entity='media_player.lg',playback_entity='media_player.lg',
            power_entity='media_player.lg',activity_entity='media_player.lg',
            activity_attribute='source',idle_apps='My launcher',browser_app='Web Browser',
            browser_url='https://ha.example/homeboard-home/overview')
        self.controller.config.pop('remote_entity')
        self.states['media_player.lg']=SimpleNamespace(state='on',attributes={'source':'My launcher'})

    async def asyncTearDown(self):
        await self.controller.stop()

    async def test_launch_uses_webos_url_and_preserves_context(self):
        context=object()
        await self.controller.cast(context)
        self.assertEqual(self.hass.services.calls[0][0],('webostv','command',{
            'entity_id':'media_player.lg','command':'system.launcher/open',
            'payload':{'target':'https://ha.example/homeboard-home/overview'}}))
        self.assertTrue(self.hass.services.calls[0][1]['blocking'])
        self.assertIs(self.hass.services.calls[0][1]['context'],context)
        self.assertFalse(self.controller.awaiting_dashboard)
        self.assertEqual(self.controller.suspended_until,0)
        self.assertGreater(self.hass.timers[-1].delay,298)
        self.states['media_player.lg'].attributes['source']='Web Browser'
        self.controller.evaluate()
        self.assertIsNone(self.controller.pending)
        await self.controller.cast()
        self.assertEqual(len(self.hass.services.calls),1)

    async def test_webos_failure_records_error_and_cooldown(self):
        self.hass.services.fail=True
        await self.controller.cast()
        self.assertEqual(self.controller.last_error,'Receiver unavailable')
        self.assertGreater(self.hass.timers[-1].delay,298)
        self.assertFalse(self.controller.awaiting_dashboard)

    async def test_verified_source_return_starts_fresh_idle_delay(self):
        self.controller.last_attempt=controller_module.monotonic()
        self.states['media_player.lg'].attributes['source']='Web Browser'
        self.controller.evaluate()
        self.states['media_player.lg'].attributes['source']='My launcher'
        self.controller.evaluate()
        self.assertEqual(self.hass.timers[-1].delay,45)

    async def test_turning_tv_off_cancels_pending_launch(self):
        self.controller.evaluate()
        timer=self.hass.timers[-1]
        self.states['media_player.lg'].state='off'
        self.controller.evaluate()
        self.assertTrue(timer.cancelled)
        await self.controller.cast()
        self.assertEqual(self.hass.services.calls,[])

    async def test_foreground_change_while_waiting_for_lock_blocks_launch(self):
        await self.controller.dispatch_lock.acquire()
        task=asyncio.create_task(self.controller.cast())
        await asyncio.sleep(0)
        self.states['media_player.lg'].attributes['source']='Netflix'
        self.controller.dispatch_lock.release()
        await task
        self.assertEqual(self.hass.services.calls,[])

    async def test_guard_only_launch_stops_when_guard_closes(self):
        self.controller.config.pop('activity_entity')
        self.controller.config['idle_guard']='binary_sensor.lg_launcher'
        self.states['binary_sensor.lg_launcher']=SimpleNamespace(state='on',attributes={})
        await self.controller.cast()
        self.assertEqual(len(self.hass.services.calls),1)
        self.states['binary_sensor.lg_launcher'].state='off'
        self.controller.evaluate()
        self.assertIsNone(self.controller.pending)
        await self.controller.cast()
        self.assertEqual(len(self.hass.services.calls),1)

    async def test_native_media_launch_preserves_params_context_and_grace(self):
        self.controller.config['app_launch_method']='webostv'
        self.controller.evaluate()
        timer=self.hass.timers[-1]
        context=object()
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            await self.controller.launch(context=context,target={'type':'app','app_id':'verified.app',
                'content_id':'episode:42','params':{'autoplay':True}})
        self.assertTrue(timer.cancelled)
        self.assertEqual(self.controller.reason,'app grace period')
        self.assertEqual(self.hass.services.calls[0][0],('webostv','command',{'entity_id':'media_player.lg',
            'command':'system.launcher/launch','payload':{'id':'verified.app','contentId':'episode:42','params':{'autoplay':True}}}))
        self.assertIs(self.hass.services.calls[0][1]['context'],context)

    async def test_invalid_or_offline_native_launch_does_not_start_grace(self):
        self.controller.config['app_launch_method']='webostv'
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            with self.assertRaises(ValueError):
                await self.controller.launch('netflix://')
            self.states['media_player.lg'].state='off'
            with self.assertRaises(ValueError):
                await self.controller.launch(target={'type':'app','app_id':'verified.app'})
        self.assertEqual(self.controller.suspended_until,0)
        self.assertEqual(self.hass.services.calls,[])

    async def test_script_fallback_keeps_app_grace_and_reports_failures(self):
        self.controller.config['app_launch_method']='webostv'
        self.hass.services.fail=True
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            with self.assertRaises(RuntimeError):
                await self.controller.launch(target={'type':'script','entity_id':'script.play_episode'})
        self.assertEqual(self.controller.last_error,'Receiver unavailable')
        self.assertEqual(self.controller.reason,'app grace period')
        self.assertEqual(self.hass.services.calls[0][0][:2],('script','turn_on'))

    async def test_webos_home_sends_home_or_launches_custom_launcher(self):
        self.controller.config['app_launch_method']='webostv'
        context=object()
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            await self.controller.return_home(context)
            self.assertEqual(self.hass.services.calls[-1][0],('webostv','button',{'entity_id':'media_player.lg','button':'HOME'}))
            self.assertEqual(self.controller.reason,'dashboard exit pause')
            self.assertIs(self.hass.services.calls[-1][1]['context'],context)
            self.controller.config['home_app']='my.custom.launcher'
            await self.controller.return_home()
            self.assertEqual(self.hass.services.calls[-1][0],('webostv','command',{'entity_id':'media_player.lg',
                'command':'system.launcher/launch','payload':{'id':'my.custom.launcher'}}))

    async def test_webos_home_offline_does_not_pause_or_send(self):
        self.controller.config['app_launch_method']='webostv'
        self.states['media_player.lg'].state='off'
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            with self.assertRaises(ValueError):await self.controller.return_home()
        self.assertEqual(self.controller.home_until,0)
        self.assertEqual(self.hass.services.calls,[])

    async def test_webos_source_launch_validates_names_before_grace(self):
        self.controller.config['app_launch_method']='webostv'
        self.states['media_player.lg'].attributes['source_list']=['Netflix','SVT Play','TV4 Play','YouTube']
        context=object()
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            for source in ['netflix','Missing']:
                with self.assertRaises(ValueError):await self.controller.launch(target={'type':'source','source':source})
            self.assertEqual(self.controller.suspended_until,0)
            self.assertEqual(self.hass.services.calls,[])
            await self.controller.launch(context=context,target={'type':'source','source':'Netflix'})
        self.assertEqual(self.hass.services.calls[0][0],('media_player','select_source',{'entity_id':'media_player.lg','source':'Netflix'}))
        self.assertIs(self.hass.services.calls[0][1]['context'],context)
        self.assertEqual(self.controller.reason,'app grace period')

    async def test_webos_source_launch_checks_offline_and_missing_source_list(self):
        self.controller.config['app_launch_method']='webostv'
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            with self.assertRaises(ValueError):await self.controller.launch(target={'type':'source','source':'Netflix'})
            self.states['media_player.lg'].attributes['source_list']=['Netflix']
            self.states['media_player.lg'].state='off'
            with self.assertRaises(ValueError):await self.controller.launch(target={'type':'source','source':'Netflix'})
        self.assertEqual(self.controller.suspended_until,0)
        self.assertEqual(self.hass.services.calls,[])

    async def test_generic_app_routes_using_integration_method_and_installed_name(self):
        self.controller.config['app_launch_method']='webostv'
        self.states['media_player.lg'].attributes['source_list']=['SVTPlay']
        context=object()
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            await self.controller.launch(app='svt_play',context=context)
        self.assertEqual(self.hass.services.calls[0][0],('media_player','select_source',{'entity_id':'media_player.lg','source':'SVTPlay'}))
        self.assertIs(self.hass.services.calls[0][1]['context'],context)
        self.assertEqual(self.controller.reason,'app grace period')

    async def test_generic_app_override_bypasses_default_installed_name_lookup(self):
        self.controller.config['app_launch_method']='webostv'
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            await self.controller.launch(app='netflix',launch_id='custom.netflix')
        self.assertEqual(self.hass.services.calls[0][0],('webostv','command',{'entity_id':'media_player.lg','command':'system.launcher/launch','payload':{'id':'custom.netflix'}}))

    async def test_missing_generic_app_does_not_start_grace_or_dispatch(self):
        self.controller.config['app_launch_method']='webostv'
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            with self.assertRaises(ValueError):await self.controller.launch(app='youtube')
        self.assertEqual(self.hass.services.calls,[])
        self.assertEqual(self.controller.suspended_until,0)

    async def test_generic_app_uses_android_when_that_is_the_saved_screen_method(self):
        self.controller.config.update(app_launch_method='androidtv_remote',remote_entity='remote.tv')
        with patch.dict(sys.modules,{'homeassistant.exceptions':exceptions}):
            await self.controller.launch(app='netflix')
        self.assertEqual(self.hass.services.calls[0][0],('remote','turn_on',{'entity_id':'remote.tv','activity':'netflix://'}))

if __name__=='__main__': unittest.main()
